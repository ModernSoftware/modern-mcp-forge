<script lang="ts">
  import ExpandableDescription from '$lib/components/ExpandableDescription.svelte';
  import { page } from '$app/state';
  import {
    readWorkspaceView,
    saveWorkspaceView
  } from '$lib/client/workspace-view';
  import ReloadProjectSources from '$lib/components/ReloadProjectSources.svelte';
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
  const manageLabels = {
    native: 'Manage source',
    bridge: 'Manage bridge',
    external: 'Manage connection'
  };
  const sourceLabels = {
    native: 'Native',
    bridge: 'Bridged',
    external: 'External'
  };
  const sourceTypes = ['native', 'bridge', 'external'] as const;
  let view = $state('detailed');
  let search = $state('');
  let kind = $state('all');
  let sourceKind = $state('all');
  let expanded = $state({ native: false, bridge: false, external: false });
  let restoredProject = $state('');
  $effect(() => {
    const id = data.project.id;
    const saved = readWorkspaceView(id);
    ({ view, search, kind, sourceKind, expanded } = saved);
    restoredProject = id;
  });
  $effect(() => {
    if (restoredProject === data.project.id) {
      saveWorkspaceView(restoredProject, {
        view,
        search,
        kind,
        sourceKind,
        expanded: { ...expanded }
      });
    }
  });
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
  let sources = $derived(
    data.sources
      .map(({ source }) => {
        const state =
          data.snapshot.project === data.project.id
            ? data.snapshot.sources.find((s) => s.id === source.id)
            : undefined;
        const items = visible.filter((row) => row.source.id === source.id);
        const total = rows.filter((row) => row.source.id === source.id).length;
        return {
          source,
          items,
          total,
          status: state?.status ?? (source.enabled ? 'stopped' : 'disabled'),
          error: state?.error
        };
      })
      .filter(
        ({ source, items, total }) =>
          (sourceKind === 'all' || source.kind === sourceKind) &&
          (items.length ||
            (!total && source.id.toLowerCase().includes(search.toLowerCase())))
      )
      .sort(
        (a, b) =>
          sourceTypes.indexOf(a.source.kind) -
          sourceTypes.indexOf(b.source.kind)
      )
  );
  function counts(items: typeof rows) {
    const n = { tools: 0, resources: 0, prompts: 0 };
    for (const item of items) n[item.category]++;
    return [
      `${n.tools} ${n.tools === 1 ? 'tool' : 'tools'}`,
      `${n.resources} ${n.resources === 1 ? 'resource' : 'resources'}`,
      `${n.prompts} ${n.prompts === 1 ? 'prompt' : 'prompts'}`
    ].join(' · ');
  }
</script>

<svelte:head><title>{data.project.name} · Modern MCP Forge</title></svelte:head>
<section class="page-heading">
  <div>
    <div class="eyebrow">PROJECT WORKSPACE</div>
    <h1>{data.project.name}</h1>
    <p>Build, edit and test your project's MCP capabilities.</p>
  </div>
</section>
<div class="workflow-toolbar project-actions" role="group" aria-label="Project actions">
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
  <a class="secondary-button" href="/workspace/cases">Named test cases</a>
  <a class="secondary-button" href="/workspace/export">Export native pack</a>
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
  <label
    >View<select aria-label="Workspace view" bind:value={view}>
      <option value="detailed">Detailed list</option><option value="grouped"
        >Group by source type</option
      >
    </select></label
  >
</div>
{#if data.legacyCount}<p class="workflow-notice" role="status">
    This project also contains {data.legacyCount} legacy definitions. They have not
    been converted to MCPack. <a href="/tools">Open legacy views</a> to review them;
    new capabilities use the native workflow.
  </p>{/if}
{#if data.cold}<p class="workflow-notice" role="status">
    This project was open when Forge stopped. Start its sources to test
    capabilities or connect an agent.
  </p>{/if}
{#if !busy && (actionError || data.snapshot.error || data.catalogError)}<p
    class="workflow-error"
    role="alert"
  >
    {actionError || data.snapshot.error || data.catalogError}
    <a href="/project">Review configuration</a>
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
{#snippet capability(row: (typeof rows)[number])}
  {@const target = new URLSearchParams({
    kind: callKind[row.category],
    name:
      'uri' in row.definition ? String(row.definition.uri) : row.definition.name
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
      <span class="source-badge" class:external={row.source.kind === 'external'}
        >{row.source.kind === 'external'
          ? 'External'
          : row.source.kind === 'bridge'
            ? 'Bridged'
            : 'Native'}</span
      >
      <span class="workflow-muted">
        {row.category} ·
        <a
          href={`/project/${row.source.kind}/${encodeURIComponent(row.source.id)}`}
          >{row.source.id}</a
        >
        {!row.source.enabled
          ? ' · Disabled source'
          : disabled
            ? ' · Disabled capability'
            : ''}
      </span>
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
{/snippet}

{#snippet sourceHeading(entry: (typeof sources)[number])}
  <div class="source-line">
    <div>
      <strong>{entry.source.id}</strong>
      <span class="workflow-muted"
        >{sourceLabels[entry.source.kind]} · {entry.status}</span
      >
      {#if entry.error}<p class="workflow-error" role="alert">{entry.error}</p>
      {:else if !entry.total}<p class="workflow-muted">
          {entry.status === 'disabled'
            ? 'Enable this source to discover its capabilities.'
            : entry.status === 'ready'
              ? entry.source.kind !== 'native' &&
                entry.source.exposure?.some((rule) => rule.hidden)
                ? 'No capabilities are exposed. Review the source’s Agent exposure settings.'
                : 'This source has an empty catalog. After wiring its implementation, reload project sources.'
              : 'Reload project sources to discover its catalog.'}
        </p>{/if}
    </div>
    <a
      class="secondary-button"
      href={`/project/${entry.source.kind}/${encodeURIComponent(entry.source.id)}`}
      >{manageLabels[entry.source.kind]}<span class="sr-only">
        {entry.source.id}</span
      ></a
    >
  </div>
{/snippet}

<div class="catalog-heading">
  <h2>{view === 'grouped' ? 'Sources by type' : 'Project capabilities'}</h2>
  <ReloadProjectSources
    projectId={data.project.id}
    generation={data.snapshot.generation}
    cold={data.cold}
    onreload={() => (actionError = '')}
    bind:busy
  />
</div>
{#if view === 'grouped' && sources.length}
  {#each sourceTypes as type (type)}
    {@const entries = sources.filter((e) => e.source.kind === type)}
    {#if entries.length}
      <details class="glass-card catalog-group" bind:open={expanded[type]}>
        <summary
          ><strong>{sourceLabels[type]}</strong>
          <span
            >{counts(entries.flatMap((e) => e.items))} · {entries.length}
            {entries.length === 1 ? 'source' : 'sources'}</span
          ></summary
        >
        {#each entries as entry (entry.source.id)}
          {@render sourceHeading(entry)}
          {#each entry.items as row (row.category + '/' + row.definition.name)}{@render capability(
              row
            )}{/each}
        {/each}
      </details>
    {/if}
  {/each}
{:else}
  {#each sources as entry (entry.source.id)}
    {#if entry.total}
      <section class="glass-card workflow-list" aria-label={entry.source.id}>
        {#each entry.items as row (row.category + '/' + row.definition.name)}
          {@render capability(row)}
        {/each}
      </section>
    {:else}
      <section class="glass-card empty-source" aria-label={entry.source.id}>
        {@render sourceHeading(entry)}
      </section>
    {/if}
  {:else}
    <section class="glass-card workflow-list">
      <div class="workflow-empty">
        <h2>
          {data.sources.length
            ? 'No matching capabilities'
            : 'Add a tool, resource or prompt'}
        </h2>
        <p>
          {data.sources.length
            ? 'Change your search or filters to see more sources and capabilities.'
            : 'Create a native capability or connect a source to this project.'}
        </p>
        {#if !data.sources.length}<a
            class="primary-button"
            href="/workspace/new">Add your first tool</a
          >{/if}
      </div>
    </section>
  {/each}
{/if}

<style>
  .project-actions {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    align-items: stretch;
    gap: 0.5rem;
  }
  .project-actions a {
    min-width: 0;
    min-height: 3.4rem;
    padding: 0.5rem;
    font-size: 0.78rem;
    line-height: 1.3;
    text-align: center;
    overflow-wrap: anywhere;
  }
  @media (max-width: 800px) {
    .project-actions {
      grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
    }
  }

  .catalog-heading,
  .source-line,
  .catalog-group summary {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .catalog-heading {
    margin: 1rem 0;
  }
  .catalog-heading h2 {
    margin: 0 auto 0 0;
    font-size: 1.1rem;
  }
  .source-line {
    justify-content: space-between;
    padding: 1rem 1.2rem;
    overflow-wrap: anywhere;
  }
  .source-line strong {
    margin-right: 0.55rem;
  }
  .source-line p {
    margin: 0.4rem 0 0;
  }
  .catalog-group,
  .empty-source {
    margin: 0.75rem 0;
  }
  .catalog-group summary {
    display: list-item;
    cursor: pointer;
    padding: 1rem 1.2rem;
  }
  .catalog-group summary span {
    margin-left: 0.5rem;
    color: var(--muted);
  }
  .catalog-group .source-line {
    border-top: 1px solid var(--border);
    background: var(--surface-2);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

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
