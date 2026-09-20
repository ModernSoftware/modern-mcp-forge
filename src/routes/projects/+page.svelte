<script lang="ts">
  import {
    goto
  } from '$app/navigation';

  let { data } = $props();

  let openingId =
    $state<string | null>(
      null
    );

  let errorMessage =
    $state('');

  let forgettingId =
    $state<string | null>(
      null
    );

  async function openRecent(
    projectId: string
  ) {
    if (openingId) {
      return;
    }

    openingId =
      projectId;
    errorMessage = '';

    try {
      const response =
        await fetch(
          '/api/projects/activate',
          {
            method: 'POST',
            headers: {
              'content-type':
                'application/json'
            },
            body: JSON.stringify({
              projectId
            })
          }
        );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ??
            `Could not open project (${response.status}).`
        );
      }

      await goto(
        '/',
        {
          invalidateAll: true
        }
      );
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : String(error);
    } finally {
      openingId = null;
    }
  }

  async function forgetRecent(
    projectId: string,
    projectName: string
  ) {
    if (forgettingId) {
      return;
    }

    if (
      !window.confirm(
        `Forget "${projectName}" on this machine? Project files and execution history will not be deleted.`
      )
    ) {
      return;
    }

    forgettingId = projectId;
    errorMessage = '';

    try {
      const response =
        await fetch(
          '/api/projects/forget',
          {
            method: 'POST',
            headers: {
              'content-type':
                'application/json'
            },
            body: JSON.stringify({
              projectId
            })
          }
        );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ??
            `Could not forget project (${response.status}).`
        );
      }

      await goto(
        '/projects',
        {
          invalidateAll: true
        }
      );
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : String(error);
    } finally {
      forgettingId = null;
    }
  }

</script>

<svelte:head>
  <title>
    Modern MCP Forge · Projects
  </title>
</svelte:head>

<section class="page-heading">
  <div>
    <div class="eyebrow">
      WORKSPACE
    </div>
    <h1>Projects</h1>
    <p>
      Forge projects are portable folders. This machine keeps only local registration and execution history in SQLite.
    </p>
  </div>

  <div class="page-actions">
    <a
      class="secondary-button"
      href="/projects/open"
    >
      Open existing
    </a>

    <a
      class="primary-button"
      href="/projects/new"
    >
      ＋ New project
    </a>
  </div>
</section>

{#if errorMessage}
  <div class="error-panel">
    {errorMessage}
  </div>
{/if}

<section class="glass-card architecture-note">
  <div>
    <strong>
      Portable project
    </strong>
    <code>
      forge.project.json · tools/ · resources/ · prompts/
    </code>
  </div>

  <span>↔</span>

  <div>
    <strong>
      Machine-local Forge state
    </strong>
    <code title={data.databasePath}>
      SQLite registry · execution history
    </code>
  </div>
</section>

{#if data.projects.length === 0}
  <section class="glass-card empty-projects">
    <div class="empty-icon">
      ▦
    </div>

    <h2>
      Create or open your first project
    </h2>

    <p>
      A new project can use an empty folder or add Forge to an existing repository that does not yet contain forge.project.json.
    </p>

    <div>
      <a
        class="primary-button"
        href="/projects/new"
      >
        New project
      </a>

      <a
        class="secondary-button"
        href="/projects/open"
      >
        Open existing
      </a>
    </div>
  </section>
{:else}
  <div class="projects-grid">
    {#each data.projects as project}
      <article
        class="glass-card project-card"
        class:active-project={
          data.activeProject?.id ===
            project.id
        }
      >
        <header>
          <div>
            <div class="project-name-row">
              <h2>
                {project.name}
              </h2>

              {#if data.activeProject?.id === project.id}
                <span class="active-badge">
                  ACTIVE
                </span>
              {/if}
            </div>

            <code title={project.path}>
              {project.path}
            </code>
          </div>

          <span
            class:available={
              project.available
            }
            class:missing={
              !project.available
            }
            class="availability"
          >
            <span class="status-dot"></span>
            {project.available
              ? 'Available'
              : 'Missing'}
          </span>
        </header>

        <div class="project-id">
          <span>
            Project ID
          </span>
          <code>
            {project.id}
          </code>
        </div>

        <footer>
          <span>
            Last opened
            {new Date(project.lastOpenedAt).toLocaleString()}
          </span>

          <div class="project-actions">
            <button
              class="forget-button compact"
              type="button"
              disabled={forgettingId !== null}
              onclick={() =>
                forgetRecent(
                  project.id,
                  project.name
                )}
            >
              {forgettingId === project.id
                ? 'Forgetting…'
                : 'Forget'}
            </button>

            {#if data.activeProject?.id === project.id}
              <a
                class="secondary-button compact"
                href="/"
              >
                Continue
              </a>
            {:else}
              <button
                class="primary-button compact"
                type="button"
                disabled={
                  !project.available ||
                  openingId !== null ||
                  forgettingId !== null
                }
                onclick={() =>
                  openRecent(
                    project.id
                  )}
              >
                {openingId === project.id
                  ? 'Opening…'
                  : 'Open'}
              </button>
            {/if}
          </div>
        </footer>
      </article>
    {/each}
  </div>
{/if}

<style>
  .page-actions {
    display: flex;
    gap: 8px;
  }

  .architecture-note {
    display: grid;
    grid-template-columns:
      1fr auto 1fr;
    align-items: center;
    gap: 18px;
    margin-bottom: 18px;
    padding: 15px 18px;
  }

  .architecture-note > div {
    min-width: 0;
  }

  .architecture-note strong,
  .architecture-note code {
    display: block;
  }

  .architecture-note strong {
    margin-bottom: 4px;
    font-size: 0.72rem;
  }

  .architecture-note code {
    overflow: hidden;
    color: var(--muted);
    font-size: 0.64rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .architecture-note > span {
    color: var(--accent);
    font-size: 1.2rem;
  }

  .projects-grid {
    display: grid;
    grid-template-columns:
      repeat(
        2,
        minmax(0, 1fr)
      );
    gap: 15px;
  }

  .project-card {
    min-width: 0;
    padding: 19px;
  }

  .project-card.active-project {
    border-color:
      color-mix(
        in srgb,
        var(--success) 30%,
        var(--border)
      );
  }

  .project-card header {
    display: flex;
    align-items: flex-start;
    justify-content:
      space-between;
    gap: 14px;
  }

  .project-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .project-card h2 {
    margin: 0 0 4px;
    font-size: 1rem;
  }

  .project-card header code {
    display: block;
    max-width: 520px;
    overflow: hidden;
    color: var(--muted);
    font-size: 0.65rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .active-badge {
    padding: 4px 6px;
    border-radius: 999px;
    color: var(--success);
    background:
      var(--success-soft);
    font-size: 0.56rem;
    font-weight: 900;
  }

  .availability {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 6px;
    font-size: 0.66rem;
    font-weight: 800;
  }

  .availability.available {
    color: var(--success);
  }

  .availability.missing {
    color: var(--danger);
  }

  .project-id {
    margin-top: 15px;
    padding: 10px 11px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background:
      color-mix(
        in srgb,
        var(--surface-solid) 48%,
        transparent
      );
  }

  .project-id span,
  .project-id code {
    display: block;
  }

  .project-id span {
    margin-bottom: 3px;
    color: var(--muted);
    font-size: 0.59rem;
    font-weight: 850;
    text-transform: uppercase;
  }

  .project-id code {
    overflow: hidden;
    color: var(--text);
    font-size: 0.64rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-card footer {
    display: flex;
    align-items: center;
    justify-content:
      space-between;
    gap: 13px;
    margin-top: 15px;
  }

  .project-card footer > span {
    color: var(--muted);
    font-size: 0.62rem;
  }

  .project-actions {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .forget-button {
    border: 0;
    color: var(--muted);
    background: transparent;
    font-weight: 800;
    cursor: pointer;
  }

  .forget-button:hover {
    color: var(--danger);
  }

  .forget-button:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  .compact {
    min-height: 34px;
    padding-inline: 11px;
    font-size: 0.68rem;
  }

  .empty-projects {
    display: grid;
    min-height: 360px;
    place-items: center;
    align-content: center;
    gap: 9px;
    padding: 35px;
    text-align: center;
  }

  .empty-projects h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  .empty-projects p {
    max-width: 580px;
    margin: 0;
    color: var(--muted);
    font-size: 0.74rem;
    line-height: 1.55;
  }

  .empty-projects > div:last-child {
    display: flex;
    gap: 8px;
    margin-top: 7px;
  }

  .empty-icon {
    display: grid;
    width: 50px;
    height: 50px;
    place-items: center;
    border-radius: 15px;
    color: var(--accent);
    background: var(--accent-soft);
    font-size: 1.25rem;
  }

  .error-panel {
    margin-bottom: 15px;
    padding: 11px 12px;
    border: 1px solid
      color-mix(
        in srgb,
        var(--danger) 32%,
        var(--border)
      );
    border-radius: 10px;
    color: var(--danger);
    background:
      var(--danger-soft);
    font-size: 0.72rem;
  }

  @media (
    max-width: 860px
  ) {
    .projects-grid {
      grid-template-columns: 1fr;
    }

    .architecture-note {
      grid-template-columns: 1fr;
    }

    .architecture-note > span {
      transform: rotate(90deg);
      justify-self: center;
    }
  }

  @media (
    max-width: 620px
  ) {
    .page-actions,
    .project-card footer {
      align-items: stretch;
      flex-direction: column;
    }

    .page-actions > * {
      width: 100%;
    }
  }
</style>
