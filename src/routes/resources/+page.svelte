<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>
    Modern MCP Forge · Resources
  </title>
</svelte:head>

<section class="page-heading">
  <div>
    <div class="eyebrow">
      MCP
    </div>
    <h1>Resources</h1>
    <p>
      Expose project knowledge as read-only MCP resources backed by files in your project or by explicitly referenced external files.
    </p>
  </div>

  <a
    class="primary-button"
    href="/resources/new"
  >
    <span>＋</span>
    Add resource
  </a>
</section>

{#if data.resources.length === 0}
  <section class="glass-card empty-state">
    <div class="empty-icon">
      ○
    </div>
    <h2>
      No resources yet
    </h2>
    <p>
      Add a Markdown, JSON, or text resource and Forge will expose it through MCP resources/list and resources/read.
    </p>
    <a
      class="primary-button"
      href="/resources/new"
    >
      Add first resource
    </a>
  </section>
{:else}
  <div class="resource-grid">
    {#each data.resources as resource}
      <article class="glass-card resource-card">
        <header>
          <div>
            <h2>
              {resource.title ??
                resource.name}
            </h2>
            <code>
              {resource.name}
            </code>
          </div>

          <div class="header-badges">
            {#if !resource.enabled}
              <span class="disabled-badge">DISABLED</span>
            {/if}
            <span class="type-badge">
              {resource.mimeType ===
                'text/markdown'
                ? 'MARKDOWN'
                : resource.mimeType ===
                    'application/json'
                  ? 'JSON'
                  : 'TEXT'}
            </span>
          </div>
        </header>

        <p>
          {resource.description ||
            'No description.'}
        </p>

        <div class="uri">
          {resource.uri}
        </div>

        <div class="source-row">
          <code>
            {resource.source}
          </code>

          <span
            class:status-ready={
              resource.sourceInfo.exists
            }
            class:status-failed={
              !resource.sourceInfo.exists
            }
          >
            <span class="status-dot"></span>
            {resource.sourceInfo.exists
              ? 'Source ready'
              : 'Missing source'}
          </span>
        </div>

        <footer>
          {#if resource.sourceInfo.external}
            <span class="external">
              External source
            </span>
          {:else}
            <span>
              Project resource
            </span>
          {/if}

          <a
            href={`/resources/${encodeURIComponent(resource.name)}`}
          >
            Open →
          </a>
        </footer>
      </article>
    {/each}
  </div>
{/if}

<style>
  .resource-grid {
    display: grid;
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
    gap: 15px;
  }

  .resource-card {
    min-width: 0;
    padding: 20px;
  }

  .resource-card header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }

  .resource-card h2 {
    margin: 0 0 4px;
    font-size: 1rem;
  }

  .resource-card header code {
    color: var(--muted);
    font-size: 0.68rem;
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

  .type-badge {
    padding: 6px 8px;
    border-radius: 999px;
    color: var(--lavender);
    background:
      var(--lavender-soft);
    font-size: 0.6rem;
    font-weight: 900;
    letter-spacing: 0.08em;
  }

  .resource-card p {
    min-height: 40px;
    margin: 14px 0;
    color: var(--muted);
    font-size: 0.76rem;
    line-height: 1.55;
  }

  .uri {
    overflow: hidden;
    padding: 9px 10px;
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--accent);
    background:
      var(--accent-soft);
    font-family:
      "Cascadia Code",
      Consolas,
      monospace;
    font-size: 0.67rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .source-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 13px;
    margin-top: 12px;
  }

  .source-row code {
    min-width: 0;
    overflow: hidden;
    color: var(--muted);
    font-size: 0.66rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .source-row span {
    flex: 0 0 auto;
    font-size: 0.65rem;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-top: 17px;
    padding-top: 13px;
    border-top:
      1px solid var(--border);
    color: var(--muted);
    font-size: 0.67rem;
  }

  footer a {
    color: var(--accent);
    font-weight: 900;
  }

  .external {
    color: var(--warning);
  }

  .empty-state {
    display: grid;
    min-height: 360px;
    place-items: center;
    align-content: center;
    gap: 9px;
    padding: 35px;
    text-align: center;
  }

  .empty-state h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  .empty-state p {
    max-width: 520px;
    margin: 0 0 8px;
    color: var(--muted);
    font-size: 0.76rem;
    line-height: 1.55;
  }

  .empty-icon {
    display: grid;
    width: 50px;
    height: 50px;
    place-items: center;
    border-radius: 15px;
    color: var(--accent);
    background: var(--accent-soft);
    font-size: 1.4rem;
  }

  @media (
    max-width: 840px
  ) {
    .resource-grid {
      grid-template-columns: 1fr;
    }

    .resource-card p {
      min-height: auto;
    }
  }
</style>
