<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  let { data } = $props();
  let busy = $state(false);
  let actionError = $state('');
  async function toggle(
    id: string,
    kind: string,
    name: string,
    enabled: boolean
  ) {
    busy = true;
    actionError = '';
    try {
      const response = await fetch('/api/project/native', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'set-capability-enabled',
          projectId: data.project.id,
          generation: data.snapshot.generation,
          id,
          kind,
          name,
          enabled
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      await invalidateAll();
    } catch (error) {
      actionError = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }
  let search = $state('');
  let kind = $state('all');
  let rows = $derived(
    data.sources.flatMap((entry) =>
      (['tools', 'resources', 'prompts'] as const).flatMap((category) =>
        (entry.source.kind === 'external'
          ? (data.snapshot.sources.find(
              (source) => source.id === entry.source.id
            )?.catalog[category] ?? [])
          : (entry.manifest?.[category] ?? [])
        ).map((definition) => ({
          definition,
          category,
          source: entry.source
        }))
      )
    )
  );
  let visible = $derived(
    rows.filter(
      (row) =>
        (kind === 'all' || row.category === kind) &&
        `${row.definition.name} ${row.definition.description ?? ''} ${row.source.id}`
          .toLowerCase()
          .includes(search.toLowerCase())
    )
  );
</script>

<svelte:head><title>{data.project.name} · Modern MCP Forge</title></svelte:head>
<section class="page-heading">
  <div>
    <div class="eyebrow">PROJECT WORKSPACE</div>
    <h1>{data.project.name}</h1>
    <p>Build, edit and test your project's MCP capabilities.</p>
  </div>
  <a class="primary-button" href="/workspace/new">＋ Add capability</a>
</section>
<div class="workflow-toolbar">
  <label
    >Search capabilities<input
      bind:value={search}
      placeholder="Name, description or source"
    /></label
  >
  <label
    >Show<select bind:value={kind}
      ><option value="all">All capabilities</option><option value="tools"
        >Tools</option
      ><option value="resources">Resources</option><option value="prompts"
        >Prompts</option
      ></select
    ></label
  >
  <a class="secondary-button" href="/workspace/connect"
    >Connect external server</a
  >
  <button disabled title="Native-only export is a subsequent step"
    >Export native · Soon</button
  >
</div>
{#if data.legacyCount}<p class="workflow-notice" role="status">
    This project also contains {data.legacyCount} legacy definitions. They have not
    been converted to MCPack. <a href="/tools">Open legacy views</a> to review them;
    new capabilities use the native workflow.
  </p>{/if}
{#if actionError}<p role="alert" class="workflow-error">{actionError}</p>{/if}
{#if data.snapshot.error || data.catalogError}<p
    class="workflow-error"
    role="alert"
  >
    {data.snapshot.error || data.catalogError}
    <a href="/project">Review sources</a>
  </p>{/if}
{#each data.sources.filter((entry) => entry.error) as entry}<p
    role="alert"
    class="workflow-error"
  >
    {entry.source.id}: {entry.error}
    <a href={`/project/native/${encodeURIComponent(entry.source.id)}`}
      >Repair source files</a
    >
  </p>{/each}
<section class="glass-card workflow-list">
  {#each visible as row (`${row.source.id}/${row.category}/${row.definition.name}`)}
    {@const disabled =
      row.source.kind === 'native' &&
      row.source.disabledCapabilities?.some(
        (entry) =>
          entry.kind === row.category && entry.name === row.definition.name
      )}
    <article class="workflow-row">
      <div>
        <span
          class="source-badge"
          class:external={row.source.kind === 'external'}
          >{row.source.kind === 'external' ? 'External' : 'Native'}</span
        >
        <span class="workflow-muted"
          >{row.category} · {row.source.id}{!row.source.enabled
            ? ' · Disabled source'
            : disabled
              ? ' · Disabled capability'
              : ''}</span
        >
        <h2>
          <a
            href={row.source.kind === 'external'
              ? `/project/external/${encodeURIComponent(row.source.id)}`
              : `/workspace/native/${encodeURIComponent(row.source.id)}/${row.category}/${encodeURIComponent(row.definition.name)}`}
            >{row.definition.name}</a
          >
        </h2>
        <p>{row.definition.description || 'No description yet.'}</p>
      </div>
      <div class="workflow-toolbar">
        {#if row.source.kind === 'native'}<button
            disabled={busy}
            onclick={() =>
              toggle(
                row.source.id,
                row.category,
                row.definition.name,
                Boolean(disabled)
              )}>{disabled ? 'Enable' : 'Disable'}</button
          >{/if}<a
          class="secondary-button"
          href={row.source.kind === 'external'
            ? `/project/external/${encodeURIComponent(row.source.id)}`
            : `/workspace/native/${encodeURIComponent(row.source.id)}/${row.category}/${encodeURIComponent(row.definition.name)}`}
          >{row.source.kind === 'external'
            ? 'Inspect & test'
            : 'Edit details'}</a
        >
      </div>
    </article>
  {:else}<div class="workflow-empty">
      <h2>
        {rows.length
          ? 'No matching capabilities'
          : 'Start with a native capability'}
      </h2>
      <p>
        {rows.length
          ? 'Change your search or filter.'
          : 'Add a tool, resource or prompt backed by a Node or Python worker.'}
      </p>
      {#if !rows.length}<a class="primary-button" href="/workspace/new"
          >Add your first capability</a
        >{/if}
    </div>{/each}
</section>
<p class="workflow-muted">
  Endpoint: <code>/mcp</code> ·
  <a href="/project">Configure sources and inspect workers</a>. Reconnect
  clients after changing definitions.
</p>

<style>
  .source-badge.external {
    color: var(--teal);
    background: color-mix(in srgb, var(--teal) 12%, transparent);
  }
</style>
