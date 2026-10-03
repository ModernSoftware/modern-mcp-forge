<script lang="ts">
  let { data } = $props();
  let search = $state('');
  let kind = $state('all');
  let rows = $derived(data.sources.flatMap((entry) =>
    (['tools', 'resources', 'prompts'] as const).flatMap((category) =>
      (entry.manifest?.[category] ?? []).map((definition) => ({ definition, category, source: entry.source }))
    )
  ));
  let visible = $derived(rows.filter((row) => (kind === 'all' || row.category === kind) &&
    `${row.definition.name} ${row.definition.description ?? ''} ${row.source.id}`.toLowerCase().includes(search.toLowerCase())));
</script>
<svelte:head><title>{data.project.name} · Modern MCP Forge</title></svelte:head>
<section class="page-heading">
  <div><div class="eyebrow">PROJECT WORKSPACE</div><h1>{data.project.name}</h1><p>Build, edit and test your project's MCP capabilities.</p></div>
  <a class="primary-button" href="/workspace/new">＋ Add capability</a>
</section>
<div class="workflow-toolbar">
  <label>Search capabilities<input bind:value={search} placeholder="Name, description or source" /></label>
  <label>Show<select bind:value={kind}><option value="all">All capabilities</option><option value="tools">Tools</option><option value="resources">Resources</option><option value="prompts">Prompts</option></select></label>
  <button disabled title="External server connections are a subsequent step">Connect external server · Soon</button>
  <button disabled title="Native-only export is a subsequent step">Export native · Soon</button>
</div>
{#if data.legacyCount}<p class="workflow-notice" role="status">This project also contains {data.legacyCount} legacy definitions. They have not been converted to MCPack. <a href="/tools">Open legacy views</a> to review them; new capabilities use the native workflow.</p>{/if}
{#if data.snapshot.error}<p class="workflow-error" role="alert">{data.snapshot.error} <a href="/project">Review sources</a></p>{/if}
{#each data.sources.filter((entry) => entry.error) as entry}<p role="alert" class="workflow-error">{entry.source.id}: {entry.error} <a href={`/project/native/${encodeURIComponent(entry.source.id)}`}>Repair source files</a></p>{/each}
<section class="glass-card workflow-list">
  {#each visible as row (`${row.source.id}/${row.category}/${row.definition.name}`)}
    <article class="workflow-row">
      <div><span class="source-badge">Native</span> <span class="workflow-muted">{row.category} · {row.source.id}{!row.source.enabled ? ' · Disabled source' : ''}</span>
      <h2><a href={`/workspace/native/${encodeURIComponent(row.source.id)}/${row.category}/${encodeURIComponent(row.definition.name)}`}>{row.definition.name}</a></h2>
      <p>{row.definition.description || 'No description yet.'}</p></div>
      <a class="secondary-button" href={`/workspace/native/${encodeURIComponent(row.source.id)}/${row.category}/${encodeURIComponent(row.definition.name)}`}>Edit details</a>
    </article>
  {:else}<div class="workflow-empty"><h2>{rows.length ? 'No matching capabilities' : 'Start with a native capability'}</h2><p>{rows.length ? 'Change your search or filter.' : 'Add a tool, resource or prompt backed by a Node or Python worker.'}</p>{#if !rows.length}<a class="primary-button" href="/workspace/new">Add your first capability</a>{/if}</div>{/each}
</section>
<p class="workflow-muted">Endpoint: <code>/mcp</code> · <a href="/project">Configure sources and inspect workers</a>. Reconnect clients after changing definitions.</p>
