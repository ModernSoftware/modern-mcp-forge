<script lang="ts">
  import {
    goto
  } from '$app/navigation';

  import DirectoryPicker
    from '$lib/components/DirectoryPicker.svelte';

  let folderPath =
    $state('');
  let name =
    $state('');
  let description =
    $state('');

  let browseOpen =
    $state(false);
  let saving =
    $state(false);
  let errorMessage =
    $state('');

  async function createProject() {
    if (saving) {
      return;
    }

    errorMessage = '';

    if (!folderPath.trim()) {
      errorMessage =
        'Project folder is required.';
      return;
    }

    saving = true;

    try {
      const response =
        await fetch(
          '/api/projects/create',
          {
            method: 'POST',
            headers: {
              'content-type':
                'application/json'
            },
            body: JSON.stringify({
              folderPath:
                folderPath.trim(),
              name:
                name.trim() ||
                undefined,
              description:
                description.trim() ||
                undefined
            })
          }
        );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ??
            `Could not create project (${response.status}).`
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
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>
    Modern MCP Forge · New Project
  </title>
</svelte:head>

<section class="page-heading">
  <div>
    <div class="eyebrow">
      PROJECT WORKSPACE
    </div>
    <h1>
      New project
    </h1>
    <p>
      Bootstrap Forge into a new folder or an existing repository that does not already contain forge.project.json.
    </p>
  </div>
</section>

<div class="form-toolbar glass-card">
  <div>
    <strong>
      Create Forge project
    </strong>
    <span>
      The project becomes active immediately after creation.
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
      form="new-project-form"
      disabled={saving}
    >
      {saving
        ? 'Creating…'
        : 'Create project →'}
    </button>
  </div>
</div>

<form
  id="new-project-form"
  class="glass-card form-card"
  onsubmit={(event) => {
    event.preventDefault();
    createProject();
  }}
>
  <label>
    <span>
      Project folder <em>*</em>
    </span>

    <small>
      Enter the exact local folder. Forge creates it if necessary and adds tools/, resources/, prompts/, and forge.project.json.
    </small>

    <div class="folder-row">
      <input
        bind:value={folderPath}
        required
        autocomplete="off"
        placeholder="C:\repos\customer-mcp"
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

  <div class="field-grid two">
    <label>
      <span>
        Project name
      </span>

      <small>
        Optional. Defaults to the selected folder name.
      </small>

      <input
        bind:value={name}
        autocomplete="off"
        placeholder="Customer MCP"
      />
    </label>

    <label>
      <span>
        Initial server version
      </span>

      <small>
        New projects begin with version 0.1.0.
      </small>

      <input
        value="0.1.0"
        disabled
      />
    </label>
  </div>

  <label>
    <span>
      Description
    </span>

    <small>
      Optional project description stored in forge.project.json.
    </small>

    <textarea
      bind:value={description}
      rows="4"
      placeholder="MCP capabilities for the customer platform..."
    ></textarea>
  </label>

  <div class="bootstrap-preview">
    <div class="eyebrow">
      BOOTSTRAP
    </div>

    <pre>forge.project.json
tools/
resources/
prompts/</pre>

    <p>
      New projects intentionally start empty. Example capabilities can be added explicitly rather than silently exposed to MCP clients.
    </p>
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
    title="Choose project folder"
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

  label {
    display: block;
    margin-top: 16px;
  }

  label:first-child {
    margin-top: 0;
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
    line-height: 1.45;
  }

  em {
    color: var(--danger);
    font-style: normal;
  }

  input,
  textarea {
    width: 100%;
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

  input {
    min-height: 42px;
    padding: 0 12px;
  }

  textarea {
    padding: 11px 12px;
    resize: vertical;
  }

  input:focus,
  textarea:focus {
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

  input:disabled {
    color: var(--muted);
    opacity: 0.76;
  }

  .folder-row {
    display: grid;
    grid-template-columns:
      minmax(0, 1fr) auto;
    gap: 8px;
  }

  .field-grid {
    display: grid;
    gap: 13px;
  }

  .field-grid.two {
    grid-template-columns:
      1fr 1fr;
  }

  .bootstrap-preview {
    margin-top: 22px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background:
      color-mix(
        in srgb,
        var(--surface-solid) 48%,
        transparent
      );
  }

  .bootstrap-preview pre {
    margin: 0;
    color: var(--text);
    font-size: 0.72rem;
    line-height: 1.6;
  }

  .bootstrap-preview p {
    margin: 9px 0 0;
    color: var(--muted);
    font-size: 0.68rem;
    line-height: 1.5;
  }

  .error-panel {
    margin-top: 15px;
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
    max-width: 650px
  ) {
    .form-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .folder-row,
    .field-grid.two {
      grid-template-columns: 1fr;
    }
  }
</style>
