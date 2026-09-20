<script lang="ts">
  import { onMount } from 'svelte';

  let {
    initialPath = '',
    title = 'Select folder',
    onSelect,
    onClose
  } = $props<{
    initialPath?: string;
    title?: string;
    onSelect: (path: string) => void;
    onClose: () => void;
  }>();

  type DirectoryItem = { name: string; path: string; };

  let currentPath = $state('');
  let parentPath = $state<string | null>(null);
  let roots = $state<string[]>([]);
  let directories = $state<DirectoryItem[]>([]);
  let loading = $state(false);
  let errorMessage = $state('');

  let createFolderOpen = $state(false);
  let newFolderName = $state('');
  let creatingFolder = $state(false);

  async function browse(path?: string) {
    loading = true;
    errorMessage = '';

    try {
      const query =
        path
          ? `?path=${encodeURIComponent(path)}`
          : '';

      const response = await fetch(`/api/filesystem/directories${query}`);

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? `Directory browse failed with status ${response.status}.`);
      }

      currentPath = payload.path;
      parentPath = payload.parentPath;
      roots = payload.roots;
      directories = payload.directories;
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : String(error);
    } finally {
      loading = false;
    }
  }


  async function createFolder() {
    if (creatingFolder || !currentPath || !newFolderName.trim()) {
      return;
    }

    creatingFolder = true;
    errorMessage = '';

    try {
      const response =
        await fetch(
          '/api/filesystem/directories/create',
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              parentPath: currentPath,
              name: newFolderName.trim()
            })
          }
        );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? `Folder creation failed with status ${response.status}.`);
      }

      newFolderName = '';
      createFolderOpen = false;

      await browse(payload.path);
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : String(error);
    } finally {
      creatingFolder = false;
    }
  }

  onMount(() => { void browse(initialPath || undefined); });
</script>

<div
  class="modal-backdrop"
  role="presentation"
  onclick={(event) => {
    if (event.currentTarget === event.target) {
      onClose();
    }
  }}
>
  <div
    class="directory-modal glass-card"
    role="dialog"
    aria-modal="true"
    aria-labelledby="directory-picker-title"
  >
    <header>
      <div>
        <div class="eyebrow">
          LOCAL FILESYSTEM
        </div>
        <h2 id="directory-picker-title">
          {title}
        </h2>
        <p>
          Forge is browsing directories through its local Bun server. Nothing is uploaded.
        </p>
      </div>

      <button
        class="close-button"
        type="button"
        aria-label="Close"
        onclick={onClose}
      >
        ×
      </button>
    </header>

    <div class="path-bar">
      <code>{currentPath || 'Loading…'}</code>
    </div>

    <div class="navigation-row">
      <button
        class="secondary-button compact"
        type="button"
        disabled={!parentPath || loading}
        onclick={() => {
          if (parentPath) {
            void browse(parentPath);
          }
        }}
      >
        ↑ Parent
      </button>

      <button
        class="secondary-button compact"
        type="button"
        disabled={!currentPath || loading}
        onclick={() => (createFolderOpen = !createFolderOpen)}
      >
        ＋ New folder
      </button>

      <div class="roots">
        {#each roots as root}
          <button
            type="button"
            disabled={loading}
            onclick={() => void browse(root)}
          >
            {root}
          </button>
        {/each}
      </div>
    </div>

    {#if createFolderOpen}
      <form
        class="create-folder-row"
        onsubmit={(event) => {
          event.preventDefault();
          void createFolder();
        }}
      >
        <input
          bind:value={newFolderName}
          autocomplete="off"
          placeholder="New folder name"
          aria-label="New folder name"
        />

        <button
          class="primary-button compact"
          type="submit"
          disabled={creatingFolder || !newFolderName.trim()}
        >
          {creatingFolder ? 'Creating…' : 'Create'}
        </button>
      </form>
    {/if}

    {#if errorMessage}
      <div class="error-panel">{errorMessage}</div>
    {/if}

    {#if loading}
      <div class="browser-state">Reading folders…</div>
    {:else if directories.length === 0}
      <div class="browser-state">This folder has no child directories.</div>
    {:else}
      <div class="directory-list">
        {#each directories as directory}
          <button
            type="button"
            onclick={() =>
              void browse(directory.path)}
          >
            <span class="folder-icon">
              ▱
            </span>
            <span>
              <strong>{directory.name}</strong>
              <code>{directory.path}</code>
            </span>
            <span class="open-arrow">
              →
            </span>
          </button>
        {/each}
      </div>
    {/if}

    <footer>
      <span>Select the currently displayed directory.</span>

      <div>
        <button
          class="secondary-button"
          type="button"
          onclick={onClose}
        >
          Cancel
        </button>

        <button
          class="primary-button"
          type="button"
          disabled={!currentPath || loading}
          onclick={() =>
            onSelect(currentPath)}
        >
          Select folder
        </button>
      </div>
    </footer>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    z-index: 120;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 22px;
    background:
      rgb(5 8 14 / 0.48);
    backdrop-filter: blur(7px);
  }

  .directory-modal {
    display: flex;
    width:
      min(
        820px,
        100%
      );
    max-height:
      min(
        780px,
        92vh
      );
    flex-direction: column;
    padding: 20px;
    overflow: hidden;
  }

  header {
    display: flex;
    justify-content:
      space-between;
    gap: 16px;
  }

  h2 {
    margin: 0 0 4px;
    font-size: 1.08rem;
  }

  header p {
    max-width: 600px;
    margin: 0;
    color: var(--muted);
    font-size: 0.7rem;
    line-height: 1.45;
  }

  .close-button {
    width: 35px;
    height: 35px;
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--muted);
    background:
      var(--surface-solid);
    cursor: pointer;
  }

  .path-bar {
    min-width: 0;
    margin: 16px 0 9px;
    padding: 10px 12px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 10px;
    background:
      color-mix(
        in srgb,
        var(--surface-solid) 64%,
        transparent
      );
  }

  .path-bar code {
    display: block;
    overflow: hidden;
    color: var(--accent);
    font-size: 0.7rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .navigation-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 9px;
  }

  .compact {
    min-height: 34px;
    padding: 0 10px;
    font-size: 0.68rem;
  }

  .roots {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .roots button {
    min-height: 30px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--muted);
    background: transparent;
    font-size: 0.64rem;
    cursor: pointer;
  }


  .create-folder-row {
    display: grid;
    grid-template-columns:
      minmax(0, 1fr) auto;
    gap: 8px;
    margin-bottom: 9px;
  }

  .create-folder-row input {
    width: 100%;
    min-height: 34px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    outline: none;
    color: var(--text);
    background: var(--surface-solid);
    font-size: 0.7rem;
  }

  .create-folder-row input:focus {
    border-color:
      color-mix(
        in srgb,
        var(--accent) 55%,
        var(--border)
      );
  }

  .directory-list {
    min-height: 0;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 11px;
  }

  .directory-list > button {
    display: grid;
    width: 100%;
    grid-template-columns:
      25px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    padding: 10px 12px;
    border: 0;
    border-bottom:
      1px solid var(--border);
    color: var(--text);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .directory-list > button:last-child {
    border-bottom: 0;
  }

  .directory-list > button:hover {
    background:
      var(--accent-soft);
  }

  .directory-list strong,
  .directory-list code {
    display: block;
  }

  .directory-list strong {
    margin-bottom: 2px;
    font-size: 0.72rem;
  }

  .directory-list code {
    overflow: hidden;
    color: var(--muted);
    font-size: 0.62rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .folder-icon {
    color: var(--accent);
    font-size: 1.05rem;
  }

  .open-arrow {
    color: var(--muted);
  }

  .browser-state {
    display: grid;
    min-height: 220px;
    place-items: center;
    color: var(--muted);
    font-size: 0.72rem;
  }

  .error-panel {
    margin-bottom: 9px;
    padding: 10px 12px;
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
    font-size: 0.7rem;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content:
      space-between;
    gap: 14px;
    padding-top: 12px;
  }

  footer > span {
    color: var(--muted);
    font-size: 0.64rem;
  }

  footer > div {
    display: flex;
    gap: 8px;
  }

  @media (
    max-width: 650px
  ) {
    .modal-backdrop {
      padding: 8px;
    }

    .directory-modal {
      max-height: 96vh;
    }

    footer,
    .navigation-row {
      align-items: stretch;
      flex-direction: column;
    }

    footer > div {
      width: 100%;
    }

    .create-folder-row {
      grid-template-columns: 1fr;
    }

    footer button {
      flex: 1;
    }
  }
</style>
