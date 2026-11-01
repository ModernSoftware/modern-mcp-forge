<script lang="ts">
  import ExpandableDescription from '$lib/components/ExpandableDescription.svelte';
  import { page } from '$app/state';
  import { reloadProjectSources } from '$lib/client/reload-project-sources';
  import { invalidateAll } from '$app/navigation';
  let { data } = $props();
  const callKind = {
    tools: 'tool',
    resources: 'resource',
    prompts: 'prompt'
  } as const;
  let busy = $state(false);
  let endpoint = $derived(new URL('/mcp', page.url).href);
  let copyNotice = $state('');
  async function reload() {
    busy = true;
    actionError = '';
    try {
      const result = await reloadProjectSources(
        data.project.id,
        data.snapshot.generation
      );
      if (result.error) throw new Error(result.error);
    } catch (error) {
      actionError = error instanceof Error ? error.message : String(error);
    } finally {
      await invalidateAll();
      busy = false;
    }
  }
  async function copyEndpoint() {
    try {
      await navigator.clipboard.writeText(endpoint);
      copyNotice = 'Copied.';
    } catch {
      copyNotice = 'Select the URL and copy it.';
    }
  }
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
  let unavailable = $derived(
    data.snapshot.sources.filter(
      (s) => s.kind !== 'native' && s.status === 'failed'
    )
  );
  let search = $state('');
  let kind = $state('all');
  let sourceKind = $state('all');
  let rows = $derived(
    data.sources.flatMap((entry) =>
      (['tools', 'resources', 'prompts'] as const).flatMap((category) =>
        (entry.source.kind !== 'native'
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
        (sourceKind === 'all' || row.source.kind === sourceKind) &&
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
</section>
<div class="workflow-toolbar" role="group" aria-label="Project actions">
  <a class="primary-button" href="/workspace/new?kind=tools">＋ Add tool</a>
  <a class="secondary-button" href="/workspace/new?kind=resources"
    >Add resource</a
  >
  <a class="secondary-button" href="/workspace/new?kind=prompts">Add prompt</a>
  <a class="secondary-button" href="/workspace/connect"
    >Connect external server</a
  >
  <a class="secondary-button" href="/workspace/connect?kind=bridge"
    >Bridge existing implementation</a
  >
  <button disabled title="Native-only export is a subsequent step"
    >Export native · Soon</button
  >
</div>
<section class="connect-agent" aria-label="Connect an agent">
  <h2>Connect an agent</h2>
  <span>Streamable HTTP</span><code>{endpoint}</code>
  <button class="secondary-button" onclick={copyEndpoint}>Copy URL</button>
  <span role="status">{copyNotice}</span>
</section>
<div class="workflow-toolbar">
  <label
    >Search tools, resources and prompts<input
      bind:value={search}
      placeholder="Name, description or source"
    /></label
  >
  <label
    >Capability type<select aria-label="Capability type" bind:value={kind}
      ><option value="all">All types</option><option value="tools">Tools</option
      ><option value="resources">Resources</option><option value="prompts"
        >Prompts</option
      ></select
    ></label
  >
  <label
    >Source type<select aria-label="Source type" bind:value={sourceKind}>
      <option value="all">All sources</option><option value="native"
        >Native</option
      >
      <option value="external">External</option><option value="bridge"
        >Bridged</option
      >
    </select></label
  >
</div>
{#if data.legacyCount}<p class="workflow-notice" role="status">
    This project also contains {data.legacyCount} legacy definitions. They have not
    been converted to MCPack. <a href="/tools">Open legacy views</a> to review them;
    new capabilities use the native workflow.
  </p>{/if}
{#if actionError || data.snapshot.error || data.catalogError}<p
    class="workflow-error"
    role="alert"
  >
    {actionError || data.snapshot.error || data.catalogError}
    <button class="secondary-button" disabled={busy} onclick={reload}
      >{busy ? 'Reloading…' : 'Reload project sources'}</button
    >
    <a href="/project">Review configuration</a>
  </p>{/if}
{#each unavailable as source (source.id)}
  <p class="workflow-error" role="alert">
    <strong>{source.id}</strong> · {source.error}
    <a href={`/project/${source.kind}/${encodeURIComponent(source.id)}`}
      >Manage connection</a
    >
    <button class="secondary-button" disabled={busy} onclick={reload}
      >Reload project sources</button
    >
  </p>
{/each}
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
    {@const target = new URLSearchParams({
      kind: callKind[row.category],
      name:
        'uri' in row.definition
          ? String(row.definition.uri)
          : row.definition.name
    })}
    {@const detail =
      row.source.kind === 'native'
        ? `/workspace/native/${encodeURIComponent(row.source.id)}/${row.category}/${encodeURIComponent(row.definition.name)}`
        : `/project/${row.source.kind}/${encodeURIComponent(row.source.id)}?${target}`}
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
          >{row.source.kind === 'external'
            ? 'External'
            : row.source.kind === 'bridge'
              ? 'Bridged'
              : 'Native'}</span
        >
        <span class="workflow-muted"
          >{row.category} · {row.source.id}{!row.source.enabled
            ? ' · Disabled source'
            : disabled
              ? ' · Disabled capability'
              : ''}</span
        >
        <h2>
          <a href={detail}>{row.definition.name}</a>
        </h2>
        <ExpandableDescription text={row.definition.description} />
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
          >{/if}<a class="secondary-button" href={detail}
          >{row.source.kind !== 'native' ? 'Inspect & test' : 'Open editor'}</a
        >
      </div>
    </article>
  {:else}<div class="workflow-empty">
      <h2>
        {rows.length
          ? 'No matching capabilities'
          : 'Add a tool, resource or prompt'}
      </h2>
      <p>
        {sourceKind === 'bridge' &&
        !rows.some((row) => row.source.kind === 'bridge')
          ? 'Attach a local Node or Python bridge to see its capabilities here.'
          : rows.length
            ? 'Change your search or filter.'
            : 'Add a tool, resource or prompt backed by a Node or Python worker.'}
      </p>
      {#if !rows.length}<a class="primary-button" href="/workspace/new"
          >Add your first tool</a
        >{/if}
    </div>{/each}
</section>

<style>
  .connect-agent {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    border-block: 1px solid var(--border);
    padding: 0.65rem 0;
  }
  .connect-agent h2 {
    margin: 0;
    font-size: 0.95rem;
  }
  .connect-agent span {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .connect-agent code {
    overflow-wrap: anywhere;
    min-width: 0;
  }
  .connect-agent button {
    min-height: 2rem;
  }
  .source-badge.external {
    color: var(--teal);
    background: color-mix(in srgb, var(--teal) 12%, transparent);
  }
</style>
