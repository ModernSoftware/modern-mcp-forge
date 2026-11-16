<script lang="ts">
  import { afterConfirmingProjectLeave } from '$lib/navigation/project-leave';
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import ConnectionTester from '$lib/components/ConnectionTester.svelte';
  import ReloadProjectSources from '$lib/components/ReloadProjectSources.svelte';
  import CapabilityExposure from '$lib/components/CapabilityExposure.svelte';
  import ExpandableDescription from '$lib/components/ExpandableDescription.svelte';
  import SourceConnection from '$lib/components/SourceConnection.svelte';
  let { data } = $props();
  const categories = ['tools', 'resources', 'prompts'] as const;
  let busy = $state(false);
  let error = $state('');
  let notice = $state('');
  let sourceState = $derived(
    data.snapshot.sources.find((source) => source.id === data.source.id)
  );
  let initial = $derived(
    page.url.searchParams.get('upstream') ??
      data.inspection.bindings.find(
        (b) =>
          b.kind === (page.url.searchParams.get('kind') ?? 'tool') + 's' &&
          b.publicKey === page.url.searchParams.get('name')
      )?.identity ??
      page.url.searchParams.get('name')
  );
  async function action(body: object) {
    if (busy) return;
    busy = true;
    error = notice = '';
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
      if ('action' in body && body.action === 'exposure')
        notice = 'Exposure saved. Reconnect agents to refresh discovery.';
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
{#if notice}<p role="status">{notice}</p>{/if}
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
{#if sourceState?.status === 'failed' && data.startupDetails}
  <details class="startup-details"><summary>Show startup details</summary><pre>{data.startupDetails}</pre></details>
{/if}
<p class="workflow-muted">
  Reload reads saved files and restarts all enabled project sources.
</p>
{#key data.source.kind + '/' + data.source.id}<SourceConnection
    projectPath={data.project.path}
    projectId={data.project.id}
    generation={data.snapshot.generation}
    kind={data.source.kind}
    source={data.source}
  />{/key}
<section class="glass-card workflow-form">
  <h2>Discovered catalog</h2>
  <p>
    Inspect the original capabilities here, including those hidden from agents.
    Agent exposure shows the published name. Calls use the original upstream
    names and URIs. Refresh by saving the connection or reloading sources.
    Resource templates, subscriptions, sampling and elicitation are not relayed.
  </p>
  {#if data.source.kind === 'bridge' && data.source.mode === 'adapter' && sourceState?.status === 'ready' && categories.every((c) => !data.inspection.catalog[c].length)}
    <p role="status">
      The adapter is connected and returned an empty catalog. Wire the discovery
      hooks in <code>{data.source.entrypoint}</code>, then reload project
      sources.
    </p>
  {/if}
  {#each (data.source.exposure ?? []).filter((r) => !data.inspection.bindings.some((b) => b.kind === r.kind && b.identity === r.identity)) as rule}
    <p class="workflow-notice">
      Review rule for {rule.kind} <code>{rule.identity}</code>. {sourceState?.status ===
      'ready'
        ? 'Missing from upstream discovery.'
        : 'Source unavailable.'}
      <button
        class="secondary-button"
        disabled={busy}
        onclick={() =>
          action({
            action: 'exposure',
            rule: { kind: rule.kind, identity: rule.identity }
          })}>Remove rule</button
      >
    </p>
  {/each}
  {#each categories as category}
    {@const items = data.inspection.catalog[category]}
    <details class="catalog-section" open>
      <summary>{category} ({items.length})</summary>
      {#each items as item ('uri' in item ? item.uri : item.name)}
        {@const identity = 'uri' in item ? item.uri : item.name}
        <article class="capability-card">
          <h3>{item.name}</h3>
          <ExpandableDescription text={item.description} />
          <CapabilityExposure
            kind={category}
            {identity}
            {busy}
            publicName={data.inspection.bindings.find(
              (b) => b.kind === category && b.identity === identity
            )?.publicName}
            rule={data.source.exposure?.find(
              (r) => r.kind === category && r.identity === identity
            )}
            save={(rule) => action({ action: 'exposure', rule })}
          />
          <details class="definition">
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
    catalog={data.inspection.catalog}
    ready={sourceState?.status === 'ready'}
    initialKind={page.url.searchParams.get('kind')}
    initialName={initial}
    bind:busy
  />
{/key}

<style>
  .catalog-section {
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }
  .catalog-section + .catalog-section {
    margin-top: 1rem;
  }
  .catalog-section > summary {
    padding: 1rem;
    cursor: pointer;
    font-weight: 800;
    text-transform: capitalize;
    background: var(--surface-solid);
  }
  .capability-card {
    padding: 1rem;
    border-top: 1px solid var(--border);
    overflow-wrap: anywhere;
  }
  .capability-card h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }
  .definition {
    margin-top: 0.7rem;
  }
  .definition summary {
    cursor: pointer;
    padding: 0.6rem 0.2rem;
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 700;
  }
  .external-json {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 0.8rem;
    max-height: 400px;
    overflow: auto;
  }
</style>
