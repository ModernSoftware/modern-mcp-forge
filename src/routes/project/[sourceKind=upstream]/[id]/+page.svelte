<script lang="ts">
  import { afterConfirmingProjectLeave } from '$lib/navigation/project-leave';
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import ConnectionTester from '$lib/components/ConnectionTester.svelte';
  import ReloadProjectSources from '$lib/components/ReloadProjectSources.svelte';
  import ExpandableDescription from '$lib/components/ExpandableDescription.svelte';
  import SourceConnection from '$lib/components/SourceConnection.svelte';
  let { data } = $props();
  const categories = ['tools', 'resources', 'prompts'] as const;
  let busy = $state(false);
  let error = $state('');
  let sourceState = $derived(
    data.snapshot.sources.find((source) => source.id === data.source.id)
  );
  async function action(body: object) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      const response = await fetch(`/api/project/${data.source.kind}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: data.project.id,
          generation: data.snapshot.generation,
          id: data.source.id,
          ...body
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      if (!('action' in body) || body.action !== 'remove')
        await invalidateAll();
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head
  ><title
    >{data.source.id} · {data.source.kind === 'bridge'
      ? 'Bridged MCP'
      : 'External MCP'} · Modern MCP Forge</title
  ></svelte:head
>
<a href="/workspace">← Workspace</a>
<section class="page-heading">
  <div>
    <div class="eyebrow">
      {data.source.kind === 'bridge' ? 'BRIDGED MCP' : 'EXTERNAL MCP'}
    </div>
    <h1>{data.source.id}</h1>
    <p>
      {sourceState?.status ?? 'stopped'} · Source definitions and schemas are owned
      upstream.
    </p>
  </div>
</section>
{#if error || sourceState?.error || data.snapshot.error || data.catalogError}<p
    role="alert"
    class="workflow-error"
  >
    {error || sourceState?.error || data.snapshot.error || data.catalogError}
  </p>{/if}
<div class="workflow-toolbar">
  <ReloadProjectSources
    projectId={data.project.id}
    generation={data.snapshot.generation}
    bind:busy
  />
  <button
    disabled={busy}
    onclick={() =>
      action({ action: data.source.enabled ? 'disable' : 'enable' })}
    >{data.source.enabled ? 'Disable connection' : 'Enable connection'}</button
  ><button
    disabled={busy}
    onclick={async () => {
      if (window.confirm('Remove this connection from the project?')) {
        await afterConfirmingProjectLeave(async () => {
          await action({ action: 'remove' });
          if (!error) await goto('/workspace', { invalidateAll: true });
        });
      }
    }}>Remove connection</button
  >
</div>
<p class="workflow-muted">Reload reads saved files and restarts all enabled project sources.</p>
{#key data.source.kind + '/' + data.source.id}<SourceConnection
    projectId={data.project.id}
    generation={data.snapshot.generation}
    kind={data.source.kind}
    source={data.source}
  />{/key}
<section class="glass-card workflow-form">
  <h2>Discovered catalog</h2>
  <p>
    Public names follow this connection's naming setting. Calls use the original
    upstream names and URIs. Refresh by saving the connection or reloading
    sources. Resource templates, subscriptions, sampling and elicitation are not
    relayed.
  </p>
  {#if data.source.kind === 'bridge' && data.source.mode === 'adapter' && sourceState?.status === 'ready' && categories.every((c) => !sourceState?.catalog[c].length)}
    <p role="status">
      The adapter is connected and returned an empty catalog. Wire the discovery
      hooks in <code>{data.source.entrypoint}</code>, then reload project
      sources.
    </p>
  {/if}
  {#each categories as category}
    {@const items = sourceState?.catalog[category] ?? []}
    <details open>
      <summary>{category} ({items.length})</summary>
      {#each items as item (item.name)}
        <article>
          <h3>{item.name}</h3>
          <ExpandableDescription text={item.description} />
          <details>
            <summary>Full definition</summary>
            <pre class="external-json">{JSON.stringify(item, null, 2)}</pre>
          </details>
        </article>
      {/each}
    </details>
  {/each}
</section>
{#key JSON.stringify( [data.project.id, data.source.kind, data.source.id, page.url.search] )}
  <ConnectionTester
    projectId={data.project.id}
    sourceId={data.source.id}
    sourceKind={data.source.kind}
    generation={data.snapshot.generation}
    catalog={sourceState?.catalog}
    ready={sourceState?.status === 'ready'}
    initialKind={page.url.searchParams.get('kind')}
    initialName={page.url.searchParams.get('name')}
    bind:busy
  />
{/key}

<style>
  .external-json {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 0.8rem;
    max-height: 400px;
    overflow: auto;
  }
</style>
