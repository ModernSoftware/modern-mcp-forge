<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  import '../app.css';

  import ThemeSwitch from '$lib/components/ThemeSwitch.svelte';

  let {
    data,
    children
  } = $props();

  let closingProject = $state(false);

  const isActive = (path: string) =>
    path === '/'
      ? page.url.pathname === '/'
      : page.url.pathname.startsWith(path);

  async function closeProject() {
    if (closingProject || !data.activeProject) {
      return;
    }

    closingProject = true;

    try {
      const response = await fetch(
        '/api/projects/close',
        {
          method: 'POST'
        }
      );

      if (!response.ok) {
        throw new Error(
          `Could not close project (${response.status}).`
        );
      }

      await goto(
        '/projects',
        {
          invalidateAll: true
        }
      );
    } finally {
      closingProject = false;
    }
  }
</script>

<svelte:head>
  <meta
    name="description"
    content="Modern MCP Forge — local-first MCP development workbench."
  />
</svelte:head>

<div class="app-frame">
  <aside class="sidebar">
    <a class="brand" href="/projects">
      <span class="brand-mark">M</span>
      <span>
        <strong>Modern MCP Forge</strong>
        <small>Local Workbench</small>
      </span>
    </a>

    <nav>
      <div class="nav-group">
        <div class="nav-title">WORKSPACE</div>

        <a
          class:active={isActive('/projects')}
          class="nav-item"
          href="/projects"
        >
          <span class="nav-icon">▦</span>
          <span>Projects</span>
        </a>

        {#if data.activeProject}
          <a
            class:active={isActive('/')}
            class="nav-item"
            href="/"
          >
            <span class="nav-icon">⌂</span>
            <span>Dashboard</span>
          </a>

          <a
            class:active={isActive('/tools')}
            class="nav-item"
            href="/tools"
          >
            <span class="nav-icon">◇</span>
            <span>Tools</span>
          </a>

          <a
            class:active={isActive('/executions')}
            class="nav-item"
            href="/executions"
          >
            <span class="nav-icon">↯</span>
            <span>Executions</span>
          </a>
        {:else}
          <span class="nav-item disabled">
            <span class="nav-icon">⌂</span>
            <span>Dashboard</span>
          </span>

          <span class="nav-item disabled">
            <span class="nav-icon">◇</span>
            <span>Tools</span>
          </span>

          <span class="nav-item disabled">
            <span class="nav-icon">↯</span>
            <span>Executions</span>
          </span>
        {/if}
      </div>

      <div class="nav-group">
        <div class="nav-title">MCP</div>

        {#if data.activeProject}
          <a
            class:active={isActive('/resources')}
            class="nav-item"
            href="/resources"
          >
            <span class="nav-icon">○</span>
            <span>Resources</span>
          </a>

          <a
            class:active={isActive('/prompts')}
            class="nav-item"
            href="/prompts"
          >
            <span class="nav-icon">✦</span>
            <span>Prompts</span>
          </a>
        {:else}
          <span class="nav-item disabled">
            <span class="nav-icon">○</span>
            <span>Resources</span>
          </span>

          <span class="nav-item disabled">
            <span class="nav-icon">✦</span>
            <span>Prompts</span>
          </span>
        {/if}
      </div>

      <div class="nav-group">
        <div class="nav-title">CONFIGURATION</div>

        {#if data.activeProject}
          <a
            class:active={isActive('/project')}
            class="nav-item"
            href="/project"
          >
            <span class="nav-icon">⚙</span>
            <span>Project</span>
          </a>
        {:else}
          <span class="nav-item disabled">
            <span class="nav-icon">⚙</span>
            <span>Project</span>
          </span>
        {/if}

        <span class="nav-item disabled">
          <span class="nav-icon">◫</span>
          <span>Environment</span>
          <small>Later</small>
        </span>
      </div>
    </nav>

    <div class="runtime-card">
      <span
        class:runtime-dot={Boolean(data.activeProject)}
        class:no-project-dot={!data.activeProject}
      ></span>

      <span class="runtime-copy">
        {#if data.activeProject}
          <strong>{data.activeProject.name}</strong>
          <small title={data.activeProject.path}>
            Active project
          </small>
        {:else}
          <strong>No project</strong>
          <small>Open or create one</small>
        {/if}
      </span>
    </div>
  </aside>

  <div class="workspace">
    <header class="topbar">
      <div class="topbar-project">
        {#if data.activeProject}
          <span class="topbar-dot"></span>

          <span class="project-copy">
            <strong>{data.activeProject.name}</strong>
            <small title={data.activeProject.path}>
              {data.activeProject.path}
            </small>
          </span>

          <button
            class="close-project"
            type="button"
            disabled={closingProject}
            onclick={closeProject}
          >
            {closingProject ? 'Closing…' : 'Close'}
          </button>
        {:else}
          <span class="topbar-idle">
            Project workspace
          </span>
        {/if}
      </div>

      <ThemeSwitch />
    </header>

    <main class="content">
      {@render children()}
    </main>
  </div>
</div>

<style>
  .app-frame {
    width: min(1500px, calc(100% - 34px));
    min-height: calc(100vh - 34px);
    margin: 17px auto;
    display: grid;
    grid-template-columns: 232px minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 24px;
    background:
      color-mix(
        in srgb,
        var(--surface) 82%,
        transparent
      );
    backdrop-filter: blur(26px);
    box-shadow: var(--shadow);
  }

  .sidebar {
    display: flex;
    min-height: calc(100vh - 34px);
    flex-direction: column;
    padding: 21px 15px;
    border-right: 1px solid var(--border);
    background:
      color-mix(
        in srgb,
        var(--surface) 56%,
        transparent
      );
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 2px 7px 21px;
  }

  .brand-mark {
    display: grid;
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    place-items: center;
    border-radius: 10px;
    color: white;
    background:
      linear-gradient(
        135deg,
        var(--accent),
        var(--teal)
      );
    box-shadow: var(--shadow-soft);
    font-weight: 950;
  }

  .brand strong,
  .brand small {
    display: block;
  }

  .brand strong {
    font-size: 0.83rem;
  }

  .brand small {
    margin-top: 2px;
    color: var(--muted);
    font-size: 0.67rem;
  }

  nav {
    flex: 1;
  }

  .nav-group {
    margin: 11px 0 18px;
  }

  .nav-title {
    padding: 0 9px 7px;
    color: var(--muted);
    font-size: 0.61rem;
    font-weight: 900;
    letter-spacing: 0.14em;
  }

  .nav-item {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    margin: 2px 0;
    padding: 10px;
    border-radius: 10px;
    color: var(--muted);
    font-size: 0.79rem;
    font-weight: 760;
  }

  .nav-item.active {
    color: var(--accent);
    background: var(--accent-soft);
  }

  .nav-item:not(.disabled):hover {
    color: var(--text);
    background:
      color-mix(
        in srgb,
        var(--surface-solid) 58%,
        transparent
      );
  }

  .nav-item.disabled {
    opacity: 0.5;
    cursor: default;
  }

  .nav-item small {
    font-size: 0.58rem;
    text-transform: uppercase;
  }

  .nav-icon {
    text-align: center;
  }

  .runtime-card {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 11px;
    border: 1px solid var(--border);
    border-radius: 11px;
    background: var(--surface);
  }

  .runtime-dot,
  .topbar-dot,
  .no-project-dot {
    width: 8px;
    height: 8px;
    flex: 0 0 8px;
    border-radius: 50%;
  }

  .runtime-dot,
  .topbar-dot {
    background: var(--success);
  }

  .no-project-dot {
    background: var(--muted);
  }

  .runtime-copy {
    min-width: 0;
  }

  .runtime-copy strong,
  .runtime-copy small {
    display: block;
  }

  .runtime-copy strong {
    overflow: hidden;
    font-size: 0.72rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .runtime-copy small {
    margin-top: 2px;
    color: var(--muted);
    font-size: 0.64rem;
  }

  .workspace {
    min-width: 0;
  }

  .topbar {
    min-height: 68px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 0 25px;
    border-bottom: 1px solid var(--border);
  }

  .topbar-project {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 9px;
  }

  .project-copy {
    display: block;
    min-width: 0;
  }

  .project-copy strong,
  .project-copy small {
    display: block;
  }

  .project-copy strong {
    font-size: 0.72rem;
  }

  .project-copy small {
    max-width: 480px;
    overflow: hidden;
    margin-top: 2px;
    color: var(--muted);
    font-size: 0.61rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .close-project {
    margin-left: 5px;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--muted);
    background: transparent;
    font-size: 0.62rem;
    font-weight: 800;
    cursor: pointer;
  }

  .close-project:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  .topbar-idle {
    color: var(--muted);
    font-size: 0.7rem;
    font-weight: 800;
  }

  .content {
    padding: 28px;
  }

  @media (max-width: 800px) {
    .app-frame {
      width: 100%;
      min-height: 100vh;
      margin: 0;
      grid-template-columns: 1fr;
      border: 0;
      border-radius: 0;
    }

    .sidebar {
      min-height: auto;
      border-right: 0;
      border-bottom: 1px solid var(--border);
    }

    nav {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }

    .runtime-card {
      display: none;
    }

    .project-copy small {
      max-width: 220px;
    }
  }
</style>
