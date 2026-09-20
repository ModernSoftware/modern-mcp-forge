<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>
    Modern MCP Forge · {data.project.name}
  </title>
</svelte:head>

<section class="page-heading">
  <div>
    <div class="eyebrow">
      ACTIVE PROJECT
    </div>
    <h1>
      {data.project.name}
    </h1>
    <p title={data.project.path}>
      {data.project.path}
    </p>
  </div>

  <a
    class="project-pill"
    href="/projects"
  >
    Switch project
  </a>
</section>

<section class="hero glass-card">
  <div>
    <div class="eyebrow">
      MCP WORKSPACE
    </div>
    <h2>
      Your project is
      <span>online.</span>
    </h2>

    <p>
      Tools, Resources, and Prompts are loaded from this project's Git-friendly forge.project.json and exposed through the same local MCP endpoint.
    </p>

    <div class="hero-actions">
      <a
        class="primary-button"
        href="/tools"
      >
        Explore tools →
      </a>

      <a
        class="secondary-button"
        href="/executions"
      >
        View executions
      </a>
    </div>
  </div>

  <div class="metric-grid">
    <article>
      <strong>
        {data.stats.tools}
      </strong>
      <span>
        Tools
      </span>
    </article>

    <article>
      <strong>
        {data.stats.resources}
      </strong>
      <span>
        Resources
      </span>
    </article>

    <article>
      <strong>
        {data.stats.prompts}
      </strong>
      <span>
        Prompts
      </span>
    </article>

    <article>
      <strong>
        {data.stats.total}
      </strong>
      <span>
        Executions
      </span>
    </article>
  </div>
</section>

<section class="dashboard-grid">
  <article class="glass-card block">
    <div class="block-heading">
      <div>
        <div class="eyebrow">
          RUNTIMES
        </div>
        <h2>
          Registered tools
        </h2>
      </div>

      <a href="/tools">
        Open tools →
      </a>
    </div>

    {#if data.tools.length === 0}
      <p class="empty">
        This project has no tools yet.
      </p>
    {:else}
      <div class="tool-summary">
        {#each data.tools as tool}
          <div class="summary-row">
            <div>
              <strong>
                {tool.name}
              </strong>

              <span
                class="runtime-badge {tool.runtime}"
              >
                {tool.runtime}
              </span>
            </div>

            <span
              class:status-ready={
                tool.ready
              }
              class:status-failed={
                !tool.ready
              }
            >
              <span class="status-dot"></span>
              {tool.ready
                ? 'Ready'
                : 'Unavailable'}
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </article>

  <article class="glass-card block">
    <div class="block-heading">
      <div>
        <div class="eyebrow">
          OBSERVABILITY
        </div>
        <h2>
          Recent executions
        </h2>
      </div>

      <a href="/executions">
        View all →
      </a>
    </div>

    {#if data.recentExecutions.length === 0}
      <p class="empty">
        No executions for this project yet.
      </p>
    {:else}
      <div class="execution-list">
        {#each data.recentExecutions as execution}
          <a
            class="execution-row"
            href={`/executions/${execution.id}`}
          >
            <span
              class:success={
                execution.status ===
                  'succeeded'
              }
              class:failed={
                execution.status !==
                  'succeeded'
              }
              class="execution-dot"
            ></span>

            <span class="execution-name">
              {execution.toolName}
            </span>

            <span class="execution-runtime">
              {execution.runtime}
            </span>

            <span class="execution-duration">
              {execution.durationMs ?? 0}
              ms
            </span>
          </a>
        {/each}
      </div>
    {/if}
  </article>
</section>

<style>
  .page-heading p {
    max-width: 760px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-pill {
    padding: 8px 11px;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--accent);
    background: var(--surface);
    font-size: 0.72rem;
    font-weight: 850;
    backdrop-filter: blur(14px);
  }

  .hero {
    display: grid;
    grid-template-columns:
      minmax(0, 1.3fr)
      minmax(320px, 0.7fr);
    gap: 28px;
    padding: 27px;
    background:
      linear-gradient(
        135deg,
        color-mix(
          in srgb,
          var(--accent-soft) 64%,
          var(--surface)
        ),
        color-mix(
          in srgb,
          var(--teal-soft) 48%,
          var(--surface)
        )
      );
  }

  .hero h2 {
    margin: 0 0 10px;
    font-size:
      clamp(
        1.55rem,
        3vw,
        2.2rem
      );
    letter-spacing: -0.04em;
  }

  .hero h2 span {
    background:
      linear-gradient(
        90deg,
        var(--accent),
        var(--teal),
        var(--lavender)
      );
    background-clip: text;
    color: transparent;
  }

  .hero p {
    max-width: 720px;
    margin: 0;
    color: var(--muted);
    line-height: 1.62;
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 22px;
  }

  .metric-grid {
    display: grid;
    grid-template-columns:
      1fr 1fr;
    gap: 10px;
  }

  .metric-grid article {
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background:
      color-mix(
        in srgb,
        var(--surface-solid) 66%,
        transparent
      );
  }

  .metric-grid strong,
  .metric-grid span {
    display: block;
  }

  .metric-grid strong {
    font-size: 1.35rem;
    letter-spacing: -0.03em;
  }

  .metric-grid span {
    margin-top: 4px;
    color: var(--muted);
    font-size: 0.7rem;
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns:
      1fr 1fr;
    gap: 17px;
    margin-top: 17px;
  }

  .block {
    padding: 22px;
  }

  .block-heading {
    display: flex;
    align-items: flex-start;
    justify-content:
      space-between;
    gap: 16px;
    margin-bottom: 17px;
  }

  .block-heading h2 {
    margin: 0;
    font-size: 1.08rem;
  }

  .block-heading a {
    color: var(--accent);
    font-size: 0.73rem;
    font-weight: 850;
  }

  .tool-summary,
  .execution-list {
    display: grid;
    gap: 8px;
  }

  .summary-row,
  .execution-row {
    min-width: 0;
    padding: 11px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background:
      color-mix(
        in srgb,
        var(--surface-solid) 52%,
        transparent
      );
  }

  .summary-row {
    display: flex;
    align-items: center;
    justify-content:
      space-between;
    gap: 13px;
  }

  .summary-row > div {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 9px;
  }

  .summary-row strong {
    overflow: hidden;
    font-size: 0.77rem;
    text-overflow: ellipsis;
  }

  .execution-row {
    display: grid;
    grid-template-columns:
      9px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 9px;
    color: var(--muted);
    font-size: 0.72rem;
  }

  .execution-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .execution-dot.success {
    background: var(--success);
  }

  .execution-dot.failed {
    background: var(--danger);
  }

  .execution-name {
    overflow: hidden;
    color: var(--text);
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .execution-runtime {
    text-transform: uppercase;
  }

  .empty {
    margin: 0;
    color: var(--muted);
    font-size: 0.74rem;
  }

  @media (
    max-width: 900px
  ) {
    .hero,
    .dashboard-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
