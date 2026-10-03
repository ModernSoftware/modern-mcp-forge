<script lang="ts">
  import ProjectSources from '$lib/components/ProjectSources.svelte';
  let { data } = $props();
</script>

<svelte:head><title>Configuration · Modern MCP Forge</title></svelte:head>
<section class="page-heading">
  <div>
    <div class="eyebrow">PROJECT CONFIGURATION</div>
    <h1>{data.project.name}</h1>
    <p>Manage source lifecycles and inspect worker definitions.</p>
  </div>
  <a class="secondary-button" href="/workspace">Open workspace</a>
</section>
<ProjectSources
  projectId={data.project.id}
  sources={data.sources.map((entry) => entry.source)}
  snapshot={data.snapshot}
  catalogError={data.catalogError}
/>
{#each data.sources as entry}
  {#if entry.manifest}<section class="glass-card workflow-form">
      <h2>{entry.source.id} · Workers</h2>
      <p class="workflow-muted">
        Configured workers, not live per-worker telemetry. Source controls
        affect every worker in that source; reload restarts all project sources.
      </p>
      {#each Object.entries(entry.manifest.workers) as [id, worker]}<div
          class="workflow-row"
        >
          <div>
            <strong>{id}</strong>
            <p>{worker.runtime} · <code>{worker.module}</code></p>
          </div>
          <span>Concurrency: {worker.maxConcurrent}</span>
        </div>{/each}
      <h3>Capability details</h3>
      {#each ['tools', 'resources', 'prompts'] as kind}{#each entry.manifest[kind as 'tools' | 'resources' | 'prompts'] as item}<p
          >
            <a
              href={`/workspace/native/${encodeURIComponent(entry.source.id)}/${kind}/${encodeURIComponent(item.name)}`}
              >{item.name}</a
            >
            · {kind}
          </p>{/each}{/each}
    </section>{/if}
{/each}
