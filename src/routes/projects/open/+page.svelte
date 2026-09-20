<script lang="ts">
  import {
    goto
  } from '$app/navigation';

  import DirectoryPicker
    from '$lib/components/DirectoryPicker.svelte';

  let folderPath =
    $state('');

  let browseOpen =
    $state(false);
  let opening =
    $state(false);
  let errorMessage =
    $state('');

  async function openProject() {
    if (opening) {
      return;
    }

    errorMessage = '';

    if (!folderPath.trim()) {
      errorMessage =
        'Project folder is required.';
      return;
    }

    opening = true;

    try {
      const response =
        await fetch(
          '/api/projects/open',
          {
            method: 'POST',
            headers: {
              'content-type':
                'application/json'
            },
            body: JSON.stringify({
              folderPath:
                folderPath.trim()
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
      opening = false;
    }
  }
</script>

<svelte:head>
  <title>
    Modern MCP Forge · Open Project
  </title>
</svelte:head>

<section class="page-heading">
  <div>
    <div class="eyebrow">
      PROJECT WORKSPACE
    </div>
    <h1>
      Open existing project
    </h1>
    <p>
      Point Forge at a folder containing forge.project.json, such as a project cloned from Git on another machine.
    </p>
  </div>
</section>

<div class="form-toolbar glass-card">
  <div>
    <strong>
      Register existing project
    </strong>
    <span>
      The project folder remains the source of truth; Forge only stores its local path and activity history.
    </span>
  </div>

  <div class="toolbar-actions">
    <a
      class="secondary-button"
      href="/projects"
    >
      Cancel
    </a>

    <button
      class="primary-button"
      type="submit"
      form="open-project-form"
      disabled={opening}
    >
      {opening
        ? 'Opening…'
        : 'Open project →'}
    </button>
  </div>
</div>

<form
  id="open-project-form"
  class="glass-card form-card"
  onsubmit={(event) => {
    event.preventDefault();
    openProject();
  }}
>
  <label>
    <span>
      Project folder <em>*</em>
    </span>

    <small>
      Select the directory itself, not forge.project.json.
    </small>

    <div class="folder-row">
      <input
        bind:value={folderPath}
        required
        autocomplete="off"
        placeholder="C:\repos\shared-customer-mcp"
      />

      <button
        class="secondary-button"
        type="button"
        onclick={() =>
          (browseOpen = true)}
      >
        Browse…
      </button>
    </div>
  </label>

  <div class="info-panel">
    <strong>
      Portable project identity
    </strong>

    <span>
      Existing projects must contain a UUID in project.id. That ID travels with forge.project.json so different machines can register different local paths for the same project.
    </span>
  </div>

  {#if errorMessage}
    <div class="error-panel">
      {errorMessage}
    </div>
  {/if}
</form>

{#if browseOpen}
  <DirectoryPicker
    initialPath={folderPath}
    title="Choose Forge project folder"
    onSelect={(path) => {
      folderPath = path;
      browseOpen = false;
    }}
    onClose={() =>
      (browseOpen = false)}
  />
{/if}

<style>
  .form-toolbar {
    position: sticky;
    top: 76px;
    z-index: 6;
    display: flex;
    align-items: center;
    justify-content:
      space-between;
    gap: 18px;
    margin-bottom: 16px;
    padding: 12px 14px;
  }

  .form-toolbar strong,
  .form-toolbar span {
    display: block;
  }

  .form-toolbar strong {
    font-size: 0.76rem;
  }

  .form-toolbar span {
    margin-top: 2px;
    color: var(--muted);
    font-size: 0.65rem;
  }

  .toolbar-actions {
    display: flex;
    gap: 8px;
  }

  .form-card {
    max-width: 900px;
    padding: 24px;
  }

  label > span,
  label > small {
    display: block;
  }

  label > span {
    margin-bottom: 4px;
    font-size: 0.75rem;
    font-weight: 850;
  }

  label > small {
    margin-bottom: 7px;
    color: var(--muted);
    font-size: 0.66rem;
  }

  em {
    color: var(--danger);
    font-style: normal;
  }

  input {
    width: 100%;
    min-height: 42px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    outline: none;
    color: var(--text);
    background:
      color-mix(
        in srgb,
        var(--surface-solid) 68%,
        transparent
      );
  }

  input:focus {
    border-color:
      color-mix(
        in srgb,
        var(--accent) 55%,
        var(--border)
      );
    box-shadow:
      0 0 0 3px
      color-mix(
        in srgb,
        var(--accent) 12%,
        transparent
      );
  }

  .folder-row {
    display: grid;
    grid-template-columns:
      minmax(0, 1fr) auto;
    gap: 8px;
  }

  .info-panel,
  .error-panel {
    margin-top: 17px;
    padding: 12px;
    border-radius: 10px;
    font-size: 0.71rem;
  }

  .info-panel {
    display: flex;
    gap: 9px;
    border: 1px solid
      color-mix(
        in srgb,
        var(--accent) 22%,
        var(--border)
      );
    background:
      color-mix(
        in srgb,
        var(--accent) 6%,
        var(--surface)
      );
  }

  .info-panel strong {
    flex: 0 0 auto;
    color: var(--accent);
  }

  .info-panel span {
    color: var(--muted);
    line-height: 1.45;
  }

  .error-panel {
    border: 1px solid
      color-mix(
        in srgb,
        var(--danger) 32%,
        var(--border)
      );
    color: var(--danger);
    background:
      var(--danger-soft);
  }

  @media (
    max-width: 650px
  ) {
    .form-toolbar,
    .info-panel {
      align-items: stretch;
      flex-direction: column;
    }

    .folder-row {
      grid-template-columns: 1fr;
    }
  }
</style>
