<script lang="ts">
  import DefinitionLifecycle from '$lib/components/DefinitionLifecycle.svelte';

  let { data } = $props();

  type Section = 'tools' | 'resources' | 'prompts';

  let section = $state<Section>('tools');
</script>

<svelte:head>
  <title>Modern MCP Forge · Project</title>
</svelte:head>

<section class="page-heading">
  <div>
    <div class="eyebrow">CONFIGURATION</div>
    <h1>Project</h1>
    <p>
      Manage the MCP definitions stored in this project's forge.project.json.
    </p>
  </div>
</section>

<section class="glass-card project-summary">
  <div>
    <span>Name</span>
    <strong>{data.manifest.project.name}</strong>
  </div>

  <div>
    <span>Project ID</span>
    <code>{data.manifest.project.id}</code>
  </div>

  <div>
    <span>Server</span>
    <strong>
      {data.manifest.server.name} · {data.manifest.server.version}
    </strong>
  </div>

  <div>
    <span>Manifest</span>
    <code title={data.project?.manifestPath}>
      {data.project?.manifestPath}
    </code>
  </div>
</section>

<div class="lifecycle-note">
  <strong>Definition lifecycle</strong>
  <span>
    Disable keeps a definition in Git but removes it from new MCP server instances. Delete removes only the declaration; Forge never deletes the underlying source/template/resource file here.
  </span>
</div>

<nav
  class="definition-tabs glass-card"
  aria-label="Definition types"
>
  <button
    class:active={section === 'tools'}
    type="button"
    onclick={() => (section = 'tools')}
  >
    Tools
    <span>{data.definitions.tools.length}</span>
  </button>

  <button
    class:active={section === 'resources'}
    type="button"
    onclick={() => (section = 'resources')}
  >
    Resources
    <span>{data.definitions.resources.length}</span>
  </button>

  <button
    class:active={section === 'prompts'}
    type="button"
    onclick={() => (section = 'prompts')}
  >
    Prompts
    <span>{data.definitions.prompts.length}</span>
  </button>
</nav>

<section class="glass-card definitions-card">
  {#if section === 'tools'}
    <div class="section-heading">
      <div>
        <div class="eyebrow">TOOLS</div>
        <h2>Tool definitions</h2>
      </div>

      <a class="primary-button" href="/tools/new">
        ＋ Add tool
      </a>
    </div>

    {#if data.definitions.tools.length === 0}
      <p class="empty">No tool definitions.</p>
    {:else}
      <div class="definition-list">
        {#each data.definitions.tools as definition (definition.name)}
          <DefinitionLifecycle
            kind="tool"
            definition={definition}
          />
        {/each}
      </div>
    {/if}

  {:else if section === 'resources'}
    <div class="section-heading">
      <div>
        <div class="eyebrow">RESOURCES</div>
        <h2>Resource definitions</h2>
      </div>

      <a class="primary-button" href="/resources/new">
        ＋ Add resource
      </a>
    </div>

    {#if data.definitions.resources.length === 0}
      <p class="empty">No resource definitions.</p>
    {:else}
      <div class="definition-list">
        {#each data.definitions.resources as definition (definition.name)}
          <DefinitionLifecycle
            kind="resource"
            definition={definition}
          />
        {/each}
      </div>
    {/if}

  {:else}
    <div class="section-heading">
      <div>
        <div class="eyebrow">PROMPTS</div>
        <h2>Prompt definitions</h2>
      </div>

      <a class="primary-button" href="/prompts/new">
        ＋ Add prompt
      </a>
    </div>

    {#if data.definitions.prompts.length === 0}
      <p class="empty">No prompt definitions.</p>
    {:else}
      <div class="definition-list">
        {#each data.definitions.prompts as definition (definition.name)}
          <DefinitionLifecycle
            kind="prompt"
            definition={definition}
          />
        {/each}
      </div>
    {/if}
  {/if}
</section>

<style>
  .project-summary {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    overflow: hidden;
    margin-bottom: 15px;
    padding: 1px;
    background: var(--border);
  }

  .project-summary > div {
    min-width: 0;
    padding: 13px;
    background:
      color-mix(
        in srgb,
        var(--surface-solid) 62%,
        var(--surface)
      );
  }

  .project-summary span,
  .project-summary strong,
  .project-summary code {
    display: block;
  }

  .project-summary span {
    margin-bottom: 4px;
    color: var(--muted);
    font-size: 0.59rem;
    font-weight: 850;
    text-transform: uppercase;
  }

  .project-summary strong,
  .project-summary code {
    overflow: hidden;
    font-size: 0.7rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lifecycle-note {
    display: flex;
    gap: 10px;
    margin-bottom: 15px;
    padding: 11px 13px;
    border: 1px solid
      color-mix(
        in srgb,
        var(--accent) 22%,
        var(--border)
      );
    border-radius: 11px;
    background:
      color-mix(
        in srgb,
        var(--accent) 5%,
        transparent
      );
    font-size: 0.69rem;
  }

  .lifecycle-note strong {
    flex: 0 0 auto;
    color: var(--accent);
  }

  .lifecycle-note span {
    color: var(--muted);
    line-height: 1.5;
  }

  .definition-tabs {
    display: flex;
    width: max-content;
    max-width: 100%;
    gap: 5px;
    margin-bottom: 15px;
    padding: 5px;
  }

  .definition-tabs button {
    display: flex;
    min-height: 36px;
    align-items: center;
    gap: 7px;
    padding: 0 13px;
    border: 0;
    border-radius: 9px;
    color: var(--muted);
    background: transparent;
    font-size: 0.72rem;
    font-weight: 850;
    cursor: pointer;
  }

  .definition-tabs button.active {
    color: var(--accent);
    background: var(--accent-soft);
  }

  .definition-tabs span {
    min-width: 20px;
    padding: 2px 5px;
    border-radius: 999px;
    background:
      color-mix(
        in srgb,
        currentColor 8%,
        transparent
      );
    font-size: 0.58rem;
  }

  .definitions-card {
    padding: 21px;
  }

  .section-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 15px;
    margin-bottom: 16px;
  }

  .section-heading h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  .definition-list {
    display: grid;
    gap: 10px;
  }

  .empty {
    margin: 0;
    color: var(--muted);
    font-size: 0.72rem;
  }

  @media (max-width: 700px) {
    .project-summary {
      grid-template-columns: 1fr;
    }

    .lifecycle-note,
    .section-heading {
      align-items: stretch;
      flex-direction: column;
    }

    .definition-tabs {
      width: 100%;
    }

    .definition-tabs button {
      flex: 1;
      justify-content: center;
    }
  }
</style>
