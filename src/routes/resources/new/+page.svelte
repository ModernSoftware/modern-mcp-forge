<script lang="ts">
  import {
    goto
  } from '$app/navigation';

  interface ProjectResourceFile {
    path: string;
    name: string;
    extension: string;
  }

  let name = $state('');
  let title = $state('');
  let description = $state('');
  let uri = $state('');
  let mimeType =
    $state('text/markdown');
  let source = $state('');

  let saving = $state(false);
  let errorMessage = $state('');

  let browseOpen = $state(false);
  let browseLoading = $state(false);
  let browseError = $state('');
  let browseFilter = $state('');
  let browseFiles =
    $state<ProjectResourceFile[]>([]);

  const filteredFiles = $derived(
    browseFiles.filter((file) =>
      file.path
        .toLowerCase()
        .includes(
          browseFilter
            .trim()
            .toLowerCase()
        )
    )
  );

  function extensionForMime():
    string {
    switch (mimeType) {
      case 'application/json':
        return 'json';

      case 'text/plain':
        return 'txt';

      default:
        return 'md';
    }
  }

  function inferMimeType(
    file: ProjectResourceFile
  ): void {
    switch (
      file.extension.toLowerCase()
    ) {
      case '.json':
        mimeType =
          'application/json';
        break;

      case '.txt':
        mimeType =
          'text/plain';
        break;

      default:
        mimeType =
          'text/markdown';
    }
  }

  async function openBrowser() {
    browseOpen = true;
    browseLoading = true;
    browseError = '';
    browseFilter = '';

    try {
      const response =
        await fetch(
          '/api/project/resource-files'
        );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ??
            `Browse failed with status ${response.status}.`
        );
      }

      browseFiles =
        payload.files;
    } catch (error) {
      browseError =
        error instanceof Error
          ? error.message
          : String(error);
    } finally {
      browseLoading = false;
    }
  }

  function chooseFile(
    file: ProjectResourceFile
  ) {
    source = file.path;
    inferMimeType(file);
    browseOpen = false;
  }

  async function saveResource() {
    errorMessage = '';

    try {
      const resourceName =
        name.trim();

      if (!resourceName) {
        throw new Error(
          'Resource name is required.'
        );
      }

      if (
        !/^[A-Za-z0-9_-]+$/.test(
          resourceName
        )
      ) {
        throw new Error(
          'Resource names may contain only letters, numbers, underscores, and hyphens.'
        );
      }

      const resourceUri =
        uri.trim() ||
        `forge://resources/${resourceName}`;

      try {
        new URL(resourceUri);
      } catch {
        throw new Error(
          'Resource URI must be a valid absolute URI.'
        );
      }

      const resourceSource =
        source.trim() ||
        `./resources/${resourceName}.${extensionForMime()}`;

      saving = true;

      const response =
        await fetch(
          '/api/project/resources',
          {
            method: 'POST',
            headers: {
              'content-type':
                'application/json'
            },
            body: JSON.stringify({
              name:
                resourceName,
              title:
                title.trim() ||
                undefined,
              description:
                description.trim(),
              enabled: true,
              uri:
                resourceUri,
              mimeType,
              source:
                resourceSource
            })
          }
        );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ??
            `Save failed with status ${response.status}.`
        );
      }

      await goto(
        `/resources/${encodeURIComponent(resourceName)}`
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
    Modern MCP Forge · Add Resource
  </title>
</svelte:head>

<section class="page-heading">
  <div>
    <div class="eyebrow">
      MCP RESOURCE AUTHORING
    </div>
    <h1>Add resource</h1>
    <p>
      Declare an existing text file or define the resource first and let Forge initialize its content afterward.
    </p>
  </div>
</section>

<div class="form-toolbar glass-card">
  <div>
    <strong>
      New resource definition
    </strong>
    <span>
      The definition is stored in forge.project.json. Content stays in its source file.
    </span>
  </div>

  <div class="toolbar-actions">
    <a
      class="secondary-button"
      href="/resources"
    >
      Cancel
    </a>

    <button
      class="primary-button"
      type="submit"
      form="resource-form"
      disabled={saving}
    >
      {saving
        ? 'Saving…'
        : 'Save resource →'}
    </button>
  </div>
</div>

<form
  id="resource-form"
  class="glass-card form-card"
  onsubmit={(event) => {
    event.preventDefault();
    saveResource();
  }}
>
  <div class="section-heading">
    <div class="eyebrow">
      DEFINITION
    </div>
    <h2>
      Resource identity
    </h2>
  </div>

  <div class="field-grid two">
    <label>
      <span>
        Name <em>*</em>
      </span>
      <small>
        Stable MCP resource identifier.
      </small>
      <input
        bind:value={name}
        required
        autocomplete="off"
        placeholder="architecture"
      />
    </label>

    <label>
      <span>Title</span>
      <small>
        Human-readable name shown to MCP clients.
      </small>
      <input
        bind:value={title}
        autocomplete="off"
        placeholder="Architecture Guide"
      />
    </label>
  </div>

  <label>
    <span>Description</span>
    <small>
      Explain what information this resource contains and when it is useful.
    </small>
    <textarea
      bind:value={description}
      rows="4"
      placeholder="Architecture and design conventions for the project..."
    ></textarea>
  </label>

  <div class="separator"></div>

  <div class="section-heading">
    <div class="eyebrow">
      MCP ADDRESS
    </div>
    <h2>
      URI and content
    </h2>
  </div>

  <label>
    <span>Resource URI</span>
    <small>
      Leave blank to generate forge://resources/&lt;name&gt; automatically.
    </small>
    <input
      bind:value={uri}
      autocomplete="off"
      placeholder="forge://docs/architecture"
    />
  </label>

  <label>
    <span>
      MIME type <em>*</em>
    </span>
    <small>
      Stage 6A is intentionally limited to editable text resources.
    </small>

    <select bind:value={mimeType}>
      <option value="text/markdown">
        Markdown — text/markdown
      </option>
      <option value="application/json">
        JSON — application/json
      </option>
      <option value="text/plain">
        Plain text — text/plain
      </option>
    </select>
  </label>

  <label>
    <span>Source file</span>
    <small>
      Relative to forge.project.json, or manually enter an external/absolute path. Leave blank to create ./resources/&lt;name&gt; automatically.
    </small>

    <div class="source-row">
      <input
        bind:value={source}
        autocomplete="off"
        placeholder={`./resources/${name || 'architecture'}.${extensionForMime()}`}
      />

      <button
        class="secondary-button"
        type="button"
        onclick={openBrowser}
      >
        Browse project…
      </button>
    </div>
  </label>

  <div class="info-panel">
    <strong>
      Existing file or new resource?
    </strong>
    <span>
      Both are supported. Choose an existing file here, or save the definition first and create the source from the resource Content tab.
    </span>
  </div>

  {#if errorMessage}
    <div class="error-panel">
      {errorMessage}
    </div>
  {/if}
</form>

{#if browseOpen}
  <div
    class="modal-backdrop"
    role="presentation"
    onclick={(event) => {
      if (
        event.currentTarget ===
        event.target
      ) {
        browseOpen = false;
      }
    }}
  >
    <div
      class="file-modal glass-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resource-browser-title"
    >
      <header>
        <div>
          <div class="eyebrow">
            PROJECT FILES
          </div>
          <h2 id="resource-browser-title">
            Choose resource source
          </h2>
          <p>
            Markdown, JSON, and text files inside the Forge project are shown.
          </p>
        </div>

        <button
          class="close-button"
          type="button"
          aria-label="Close"
          onclick={() =>
            (browseOpen = false)}
        >
          ×
        </button>
      </header>

      <input
        class="file-search"
        bind:value={browseFilter}
        autocomplete="off"
        placeholder="Filter files..."
      />

      {#if browseLoading}
        <div class="browser-state">
          Scanning project…
        </div>
      {:else if browseError}
        <div class="error-panel">
          {browseError}
        </div>
      {:else if filteredFiles.length === 0}
        <div class="browser-state">
          No compatible files found.
        </div>
      {:else}
        <div class="file-list">
          {#each filteredFiles as file}
            <button
              type="button"
              onclick={() =>
                chooseFile(file)}
            >
              <span class="file-icon">
                ○
              </span>
              <span>
                <strong>
                  {file.name}
                </strong>
                <code>
                  {file.path}
                </code>
              </span>
            </button>
          {/each}
        </div>
      {/if}

      <footer>
        <span>
          External files can still be entered manually.
        </span>
        <button
          class="secondary-button"
          type="button"
          onclick={() =>
            (browseOpen = false)}
        >
          Close
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .form-toolbar {
    position: sticky;
    top: 76px;
    z-index: 6;
    display: flex;
    align-items: center;
    justify-content: space-between;
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

  .section-heading {
    margin-bottom: 17px;
  }

  .section-heading h2 {
    margin: 0;
    font-size: 1.08rem;
  }

  .field-grid {
    display: grid;
    gap: 13px;
  }

  .field-grid.two {
    grid-template-columns:
      1fr 1fr;
  }

  label {
    display: block;
    margin-top: 15px;
  }

  .field-grid label {
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
  textarea,
  select {
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

  input,
  select {
    min-height: 42px;
    padding: 0 12px;
  }

  textarea {
    padding: 11px 12px;
    resize: vertical;
  }

  input:focus,
  textarea:focus,
  select:focus {
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

  .separator {
    height: 1px;
    margin: 25px 0;
    background: var(--border);
  }

  .source-row {
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
    background: var(--danger-soft);
  }

  .modal-backdrop {
    position: fixed;
    z-index: 100;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    background:
      rgb(5 8 14 / 0.46);
    backdrop-filter: blur(6px);
  }

  .file-modal {
    display: grid;
    width: min(780px, 100%);
    max-height: min(
      760px,
      88vh
    );
    grid-template-rows:
      auto auto minmax(0, 1fr) auto;
    padding: 20px;
    box-shadow: var(--shadow);
  }

  .file-modal header {
    display: flex;
    justify-content:
      space-between;
    gap: 15px;
  }

  .file-modal h2 {
    margin: 0 0 4px;
    font-size: 1.06rem;
  }

  .file-modal header p {
    margin: 0;
    color: var(--muted);
    font-size: 0.7rem;
  }

  .close-button {
    width: 34px;
    height: 34px;
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--muted);
    background: var(--surface-solid);
    font-size: 1.1rem;
    cursor: pointer;
  }

  .file-search {
    margin: 16px 0 10px;
  }

  .file-list {
    min-height: 0;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 11px;
  }

  .file-list button {
    display: grid;
    width: 100%;
    grid-template-columns:
      22px minmax(0, 1fr);
    gap: 9px;
    padding: 11px 12px;
    border: 0;
    border-bottom:
      1px solid var(--border);
    color: var(--text);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .file-list button:last-child {
    border-bottom: 0;
  }

  .file-list button:hover {
    background:
      var(--accent-soft);
  }

  .file-list strong,
  .file-list code {
    display: block;
  }

  .file-list strong {
    margin-bottom: 3px;
    font-size: 0.72rem;
  }

  .file-list code {
    overflow: hidden;
    color: var(--muted);
    font-size: 0.65rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-icon {
    color: var(--accent);
  }

  .browser-state {
    display: grid;
    min-height: 180px;
    place-items: center;
    color: var(--muted);
    font-size: 0.73rem;
  }

  .file-modal footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
    padding-top: 12px;
  }

  .file-modal footer span {
    color: var(--muted);
    font-size: 0.64rem;
  }

  @media (
    max-width: 700px
  ) {
    .form-toolbar,
    .file-modal footer {
      align-items: stretch;
      flex-direction: column;
    }

    .field-grid.two,
    .source-row {
      grid-template-columns: 1fr;
    }

    .toolbar-actions > * {
      flex: 1;
    }
  }
</style>
