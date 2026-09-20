<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>
    Modern MCP Forge · Prompts
  </title>
</svelte:head>

<section class="page-heading">
  <div>
    <div class="eyebrow">
      MCP
    </div>
    <h1>Prompts</h1>
    <p>
      Author reusable parameterized prompt templates and expose them through MCP.
    </p>
  </div>

  <a
    class="primary-button"
    href="/prompts/new"
  >
    <span>＋</span>
    Add prompt
  </a>
</section>

{#if data.prompts.length === 0}
  <section class="glass-card empty-state">
    <div class="empty-icon">
      ✦
    </div>
    <h2>
      No prompts yet
    </h2>
    <p>
      Create a reusable template and Forge will expose it through prompts/list and prompts/get.
    </p>
    <a
      class="primary-button"
      href="/prompts/new"
    >
      Add first prompt
    </a>
  </section>
{:else}
  <div class="prompt-grid">
    {#each data.prompts as prompt}
      <article class="glass-card prompt-card">
        <header>
          <div>
            <h2>
              {prompt.title ??
                prompt.name}
            </h2>
            <code>
              {prompt.name}
            </code>
          </div>

          <div class="header-badges">
            {#if !prompt.enabled}
              <span class="disabled-badge">DISABLED</span>
            {/if}
            <span class="role-badge">
              {prompt.role}
            </span>
          </div>
        </header>

        <p>
          {prompt.description ||
            'No description.'}
        </p>

        <div class="template-path">
          {prompt.template}
        </div>

        <div class="metadata">
          <span>
            {Object.keys(prompt.arguments).length}
            argument{Object.keys(prompt.arguments).length === 1 ? '' : 's'}
          </span>

          <span
            class:status-ready={
              prompt.sourceInfo.exists
            }
            class:status-failed={
              !prompt.sourceInfo.exists
            }
          >
            <span class="status-dot"></span>
            {prompt.sourceInfo.exists
              ? 'Template ready'
              : 'Missing template'}
          </span>
        </div>

        <footer>
          {#if prompt.sourceInfo.external}
            <span class="external">
              External template
            </span>
          {:else}
            <span>
              Project prompt
            </span>
          {/if}

          <a
            href={`/prompts/${encodeURIComponent(prompt.name)}`}
          >
            Open →
          </a>
        </footer>
      </article>
    {/each}
  </div>
{/if}

<style>
  .prompt-grid {
    display: grid;
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
    gap: 15px;
  }

  .prompt-card {
    min-width: 0;
    padding: 20px;
  }

  .prompt-card header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }

  .prompt-card h2 {
    margin: 0 0 4px;
    font-size: 1rem;
  }

  .prompt-card header code {
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

  .role-badge {
    padding: 6px 8px;
    border-radius: 999px;
    color: var(--lavender);
    background:
      var(--lavender-soft);
    font-size: 0.6rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  .prompt-card p {
    min-height: 40px;
    margin: 14px 0;
    color: var(--muted);
    font-size: 0.76rem;
    line-height: 1.55;
  }

  .template-path {
    overflow: hidden;
    padding: 9px 10px;
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--accent);
    background: var(--accent-soft);
    font-family:
      "Cascadia Code",
      Consolas,
      monospace;
    font-size: 0.67rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .metadata {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 13px;
    margin-top: 12px;
    color: var(--muted);
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
    color: var(--lavender);
    background: var(--lavender-soft);
    font-size: 1.25rem;
  }

  @media (
    max-width: 840px
  ) {
    .prompt-grid {
      grid-template-columns: 1fr;
    }

    .prompt-card p {
      min-height: auto;
    }
  }
</style>
