<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>Modern MCP Forge · Tools</title>
</svelte:head>

<section class="page-heading">
  <div>
    <div class="eyebrow">WORKBENCH</div>
    <h1>Tools</h1>
    <p>
      Inspect, test, and author capabilities exposed by the Forge project manifest.
    </p>
  </div>

  <a class="primary-button" href="/tools/new">
    <span>＋</span>
    Add tool
  </a>
</section>

<div class="tool-grid">
  {#each data.tools as tool}
    {@const advancedSchema = tool.argumentsMode === 'json-schema'}

    <article class="tool-card glass-card">
      <div class="tool-header">
        <div>
          <h2>{tool.title ?? tool.name}</h2>
          <code>{tool.name}</code>
        </div>
        <div class="header-badges">
          {#if !tool.enabled}
            <span class="disabled-badge">DISABLED</span>
          {/if}
          <span class="runtime-badge {tool.runtime}">
            {tool.runtime}
          </span>
        </div>
      </div>

      <p>{tool.description}</p>

      <div class="path">{tool.entrypoint}</div>

      <div class="metadata">
        {#if advancedSchema}
          <span>JSON Schema input</span>
        {:else}
          <span>
            {Object.keys(tool.arguments).length}
            argument{Object.keys(tool.arguments).length === 1 ? '' : 's'}
          </span>
        {/if}

        <span>
          {tool.timeoutMs.toLocaleString()} ms timeout
        </span>
      </div>

      <footer>
        <span
          class:status-ready={tool.enabled && tool.runtimeStatus.ready}
          class:status-failed={tool.enabled && !tool.runtimeStatus.ready}
          class:definition-disabled={!tool.enabled}
        >
          <span class="status-dot"></span>
          {!tool.enabled
            ? 'Disabled'
            : tool.runtimeStatus.ready
              ? 'Ready'
              : 'Runtime unavailable'}
        </span>

        <a href={`/tools/${encodeURIComponent(tool.name)}`}>
          View / Test →
        </a>
      </footer>
    </article>
  {/each}
</div>

<style>
  .tool-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 15px;
  }

  .tool-card {
    min-width: 0;
    padding: 20px;
    transition:
      transform 160ms ease,
      border-color 160ms ease;
  }

  .tool-card:hover {
    transform: translateY(-2px);
    border-color: color-mix(
      in srgb,
      var(--accent) 28%,
      var(--border)
    );
  }

  .tool-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  h2 {
    margin: 0 0 4px;
    font-size: 1rem;
  }

  .tool-header code {
    color: var(--muted);
    font-size: 0.7rem;
  }

  .header-badges {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .disabled-badge {
    padding: 5px 7px;
    border-radius: 999px;
    color: var(--muted);
    background: color-mix(in srgb, var(--muted) 10%, transparent);
    font-size: 0.56rem;
    font-weight: 900;
  }

  .definition-disabled {
    color: var(--muted);
  }

  p {
    min-height: 42px;
    margin: 15px 0;
    color: var(--muted);
    font-size: 0.8rem;
    line-height: 1.55;
  }

  .path {
    overflow: hidden;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--muted);
    background: color-mix(
      in srgb,
      var(--surface-solid) 55%,
      transparent
    );
    font-family: "Cascadia Code", Consolas, monospace;
    font-size: 0.69rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .metadata {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 15px;
    margin-top: 13px;
    color: var(--muted);
    font-size: 0.68rem;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
    margin-top: 17px;
  }

  footer a {
    color: var(--accent);
    font-size: 0.74rem;
    font-weight: 900;
  }

  @media (max-width: 830px) {
    .tool-grid {
      grid-template-columns: 1fr;
    }

    p {
      min-height: auto;
    }
  }
</style>
