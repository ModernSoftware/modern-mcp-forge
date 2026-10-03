<script lang="ts">
  import { afterConfirmingProjectLeave } from '$lib/navigation/project-leave';
  import { goto, invalidateAll } from '$app/navigation';
  import ExternalConnection from '$lib/components/ExternalConnection.svelte';
  let { data } = $props();
  let busy = $state(false);
  let error = $state('');
  let result = $state('');
  let kind = $state<'tool' | 'resource' | 'prompt'>('tool');
  let name = $state('');
  let args = $state('{}');
  let sourceState = $derived(
    data.snapshot.sources.find((source) => source.id === data.source.id)
  );
  let capabilities = $derived(
    kind === 'tool'
      ? (sourceState?.catalog.tools ?? [])
      : kind === 'resource'
        ? (sourceState?.catalog.resources ?? [])
        : (sourceState?.catalog.prompts ?? [])
  );
  async function action(body: object) {
    if (busy) return;
    busy = true;
    error = '';
    result = '';
    try {
      const response = await fetch('/api/project/external', {
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
      if (payload.result) result = JSON.stringify(payload.result, null, 2);
      if (!('action' in body) || body.action !== 'remove')
        await invalidateAll();
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    } finally {
      busy = false;
    }
  }
  function invoke() {
    try {
      const argumentsValue = kind === 'resource' ? {} : JSON.parse(args);
      void action({ action: 'invoke', kind, name, arguments: argumentsValue });
    } catch {
      error = 'Arguments must be valid JSON.';
    }
  }
</script>

<svelte:head
  ><title>{data.source.id} · External MCP · Modern MCP Forge</title
  ></svelte:head
>
<a href="/workspace">← Workspace</a>
<section class="page-heading">
  <div>
    <div class="eyebrow">EXTERNAL MCP</div>
    <h1>{data.source.id}</h1>
    <p>
      {sourceState?.status ?? 'stopped'} · Source definitions and schemas are owned
      upstream.
    </p>
  </div>
</section>
{#if error || data.snapshot.error || data.catalogError}<p
    role="alert"
    class="workflow-error"
  >
    {error || data.snapshot.error || data.catalogError}
  </p>{/if}
<div class="workflow-toolbar">
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
{#key data.source.id}<ExternalConnection
    projectId={data.project.id}
    generation={data.snapshot.generation}
    source={data.source}
  />{/key}
<section class="glass-card workflow-form">
  <h2>Discovered catalog</h2>
  <p>
    Public names have a connection prefix. Calls use the original upstream names
    and URIs. Refresh by saving the connection or reloading sources. Resource
    templates, subscriptions, sampling and elicitation are not relayed.
  </p>
  {#each ['tools', 'resources', 'prompts'] as category}<details open>
      <summary>{category}</summary>
      <pre class="external-json">{JSON.stringify(
          sourceState?.catalog[category as 'tools' | 'resources' | 'prompts'] ??
            [],
          null,
          2
        )}</pre>
    </details>{/each}
</section>
<section class="glass-card workflow-form">
  <h2>Test an external capability</h2>
  <label
    >Kind<select
      bind:value={kind}
      onchange={() => {
        name = '';
        result = '';
      }}
      ><option value="tool">Tool</option><option value="resource"
        >Resource</option
      ><option value="prompt">Prompt</option></select
    ></label
  >
  <label
    >Capability<select bind:value={name}
      ><option value="">Select a capability</option
      >{#each capabilities as capability}<option
          value={'uri' in capability ? String(capability.uri) : capability.name}
          >{capability.name}</option
        >{/each}</select
    ></label
  >
  {#if kind !== 'resource'}<label
      >Arguments (JSON)<textarea bind:value={args} rows="5"></textarea></label
    >{/if}
  <button
    class="primary-button"
    disabled={busy || sourceState?.status !== 'ready' || !name}
    onclick={invoke}>{busy ? 'Running…' : 'Run request'}</button
  >
  {#if result}<pre class="external-json">{result}</pre>{/if}
</section>

<style>
  .external-json {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 0.8rem;
    max-height: 400px;
    overflow: auto;
  }
</style>
