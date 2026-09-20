<script lang="ts">
  import {
    goto
  } from '$app/navigation';

  interface ArgumentRow {
    id: string;
    name: string;
    description: string;
    required: boolean;
  }

  interface ProjectPromptFile {
    path: string;
    name: string;
    extension: string;
  }

  let name = $state('');
  let title = $state('');
  let description = $state('');
  let role = $state<'user' | 'assistant'>('user');
  let template = $state('');

  let argumentRows =
    $state<ArgumentRow[]>([]);

  let saving = $state(false);
  let errorMessage = $state('');

  let browseOpen = $state(false);
  let browseLoading = $state(false);
  let browseError = $state('');
  let browseFilter = $state('');
  let browseFiles =
    $state<ProjectPromptFile[]>([]);

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

  function addArgument() {
    argumentRows.push({
      id: crypto.randomUUID(),
      name: '',
      description: '',
      required: false
    });
  }

  function removeArgument(
    id: string
  ) {
    const index =
      argumentRows.findIndex(
        (argument) =>
          argument.id === id
      );

    if (index >= 0) {
      argumentRows.splice(
        index,
        1
      );
    }
  }

  function buildArguments() {
    const result: Record<
      string,
      {
        description?: string;
        required: boolean;
      }
    > = {};

    for (
      const argument
      of argumentRows
    ) {
      const argumentName =
        argument.name.trim();

      if (!argumentName) {
        throw new Error(
          'Every prompt argument needs a name.'
        );
      }

      if (
        !/^[A-Za-z0-9_-]+$/.test(
          argumentName
        )
      ) {
        throw new Error(
          `Argument "${argumentName}" may contain only letters, numbers, underscores, and hyphens.`
        );
      }

      if (
        argumentName in result
      ) {
        throw new Error(
          `Argument "${argumentName}" is declared more than once.`
        );
      }

      result[argumentName] = {
        description:
          argument.description.trim() ||
          undefined,
        required:
          argument.required
      };
    }

    return result;
  }

  async function openBrowser() {
    browseOpen = true;
    browseLoading = true;
    browseError = '';
    browseFilter = '';

    try {
      const response =
        await fetch(
          '/api/project/prompt-files'
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
    file: ProjectPromptFile
  ) {
    template = file.path;
    browseOpen = false;
  }

  async function savePrompt() {
    errorMessage = '';

    try {
      const promptName =
        name.trim();

      if (!promptName) {
        throw new Error(
          'Prompt name is required.'
        );
      }

      if (
        !/^[A-Za-z0-9_-]+$/.test(
          promptName
        )
      ) {
        throw new Error(
          'Prompt names may contain only letters, numbers, underscores, and hyphens.'
        );
      }

      const promptTemplate =
        template.trim() ||
        `./prompts/${promptName}.md`;

      saving = true;

      const response =
        await fetch(
          '/api/project/prompts',
          {
            method: 'POST',
            headers: {
              'content-type':
                'application/json'
            },
            body: JSON.stringify({
              name:
                promptName,
              title:
                title.trim() ||
                undefined,
              description:
                description.trim(),
              enabled: true,
              role,
              template:
                promptTemplate,
              arguments:
                buildArguments()
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
        `/prompts/${encodeURIComponent(promptName)}`
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
    Modern MCP Forge · Add Prompt
  </title>
</svelte:head>

<section class="page-heading">
  <div>
    <div class="eyebrow">
      MCP PROMPT AUTHORING
    </div>
    <h1>Add prompt</h1>
    <p>
      Define a reusable MCP prompt and bind its arguments into a Markdown or text template.
    </p>
  </div>
</section>

<div class="form-toolbar glass-card">
  <div>
    <strong>
      New prompt definition
    </strong>
    <span>
      The definition stays in forge.project.json; the template stays in its own file.
    </span>
  </div>

  <div class="toolbar-actions">
    <a
      class="secondary-button"
      href="/prompts"
    >
      Cancel
    </a>

    <button
      class="primary-button"
      type="submit"
      form="prompt-form"
      disabled={saving}
    >
      {saving
        ? 'Saving…'
        : 'Save prompt →'}
    </button>
  </div>
</div>

<form
  id="prompt-form"
  class="authoring-grid"
  onsubmit={(event) => {
    event.preventDefault();
    savePrompt();
  }}
>
  <section class="glass-card form-card">
    <div class="section-heading">
      <div class="eyebrow">
        DEFINITION
      </div>
      <h2>
        Prompt identity
      </h2>
    </div>

    <div class="field-grid two">
      <label>
        <span>
          Name <em>*</em>
        </span>
        <small>
          Stable MCP prompt identifier.
        </small>
        <input
          bind:value={name}
          required
          autocomplete="off"
          placeholder="review_code"
        />
      </label>

      <label>
        <span>Title</span>
        <small>
          Human-readable display name.
        </small>
        <input
          bind:value={title}
          autocomplete="off"
          placeholder="Code Review"
        />
      </label>
    </div>

    <label>
      <span>Description</span>
      <small>
        Explain when a client or user should choose this prompt.
      </small>
      <textarea
        bind:value={description}
        rows="4"
        placeholder="Review source code for defects, security, and maintainability..."
      ></textarea>
    </label>

    <label>
      <span>Message role</span>
      <small>
        The role of the rendered MCP prompt message.
      </small>

      <select bind:value={role}>
        <option value="user">
          User
        </option>
        <option value="assistant">
          Assistant
        </option>
      </select>
    </label>

    <label>
      <span>Template file</span>
      <small>
        Leave blank for ./prompts/&lt;name&gt;.md, choose an existing project file, or enter an external path manually.
      </small>

      <div class="template-row">
        <input
          bind:value={template}
          autocomplete="off"
          placeholder={`./prompts/${name || 'review_code'}.md`}
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
  </section>

  <section class="glass-card arguments-card">
    <div class="section-heading">
      <div class="eyebrow">
        PARAMETERS
      </div>
      <h2>
        Prompt arguments
      </h2>
      <p>
        Arguments are strings and are inserted using <code>{'{{argumentName}}'}</code>.
      </p>
    </div>

    <div class="arguments-heading">
      <span>
        Keep these lightweight; MCP prompt arguments are user-supplied template parameters.
      </span>

      <button
        class="secondary-button"
        type="button"
        onclick={addArgument}
      >
        ＋ Add argument
      </button>
    </div>

    {#if argumentRows.length === 0}
      <div class="empty-state">
        <strong>
          No arguments
        </strong>
        <span>
          This prompt will render as a fixed template.
        </span>
        <button
          class="secondary-button"
          type="button"
          onclick={addArgument}
        >
          Add first argument
        </button>
      </div>
    {:else}
      <div class="argument-list">
        {#each argumentRows as argument (argument.id)}
          <article class="argument-row">
            <div class="argument-topline">
              <strong>
                {argument.name ||
                  'New argument'}
              </strong>

              <button
                class="delete-button"
                type="button"
                onclick={() =>
                  removeArgument(
                    argument.id
                  )}
              >
                Remove
              </button>
            </div>

            <div class="field-grid argument-fields">
              <label>
                <span>
                  Name <em>*</em>
                </span>
                <input
                  bind:value={argument.name}
                  required
                  autocomplete="off"
                  placeholder="language"
                />
              </label>

              <label class="description-field">
                <span>
                  Description
                </span>
                <input
                  bind:value={argument.description}
                  autocomplete="off"
                  placeholder="Programming language being reviewed..."
                />
              </label>

              <label class="required-field">
                <span>
                  Required
                </span>
                <span class="checkbox-row">
                  <input
                    type="checkbox"
                    bind:checked={argument.required}
                  />
                  Required by callers
                </span>
              </label>
            </div>
          </article>
        {/each}
      </div>
    {/if}

    {#if errorMessage}
      <div class="error-panel">
        {errorMessage}
      </div>
    {/if}
  </section>
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
      aria-labelledby="prompt-browser-title"
    >
      <header>
        <div>
          <div class="eyebrow">
            PROJECT FILES
          </div>
          <h2 id="prompt-browser-title">
            Choose prompt template
          </h2>
          <p>
            Markdown and text files inside the Forge project are shown.
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
                ✦
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
          External templates can still be entered manually.
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

  .authoring-grid {
    display: grid;
    grid-template-columns:
      minmax(390px, 0.95fr)
      minmax(430px, 1.05fr);
    gap: 16px;
    align-items: start;
  }

  .form-card,
  .arguments-card {
    min-width: 0;
    padding: 23px;
  }

  .section-heading {
    margin-bottom: 17px;
  }

  .section-heading h2 {
    margin: 0;
    font-size: 1.08rem;
  }

  .section-heading p {
    margin: 6px 0 0;
    color: var(--muted);
    font-size: 0.7rem;
  }

  .section-heading code {
    color: var(--accent);
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

  input:not([type='checkbox']),
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

  input:not([type='checkbox']),
  select {
    min-height: 42px;
    padding: 0 12px;
  }

  textarea {
    padding: 11px 12px;
    resize: vertical;
  }

  .template-row {
    display: grid;
    grid-template-columns:
      minmax(0, 1fr) auto;
    gap: 8px;
  }

  .arguments-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }

  .arguments-heading > span {
    max-width: 520px;
    color: var(--muted);
    font-size: 0.7rem;
    line-height: 1.45;
  }

  .empty-state {
    display: grid;
    min-height: 190px;
    place-items: center;
    align-content: center;
    gap: 7px;
    margin-top: 18px;
    padding: 25px;
    border: 1px dashed
      color-mix(
        in srgb,
        var(--muted) 28%,
        transparent
      );
    border-radius: 13px;
    color: var(--muted);
    text-align: center;
  }

  .empty-state strong {
    color: var(--text);
  }

  .argument-list {
    display: grid;
    gap: 11px;
    margin-top: 18px;
  }

  .argument-row {
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
  }

  .argument-topline {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .argument-topline strong {
    font-size: 0.75rem;
  }

  .delete-button {
    border: 0;
    color: var(--danger);
    background: transparent;
    font-size: 0.67rem;
    font-weight: 850;
    cursor: pointer;
  }

  .argument-fields {
    grid-template-columns:
      150px minmax(0, 1fr)
      160px;
  }

  .checkbox-row {
    display: flex;
    min-height: 42px;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--muted);
    font-size: 0.67rem;
    font-weight: 700;
  }

  .checkbox-row input {
    width: 17px;
    height: 17px;
    accent-color: var(--accent);
  }

  .error-panel {
    margin-top: 15px;
    padding: 12px;
    border: 1px solid
      color-mix(
        in srgb,
        var(--danger) 32%,
        var(--border)
      );
    border-radius: 10px;
    color: var(--danger);
    background: var(--danger-soft);
    font-size: 0.72rem;
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
    max-height: min(760px, 88vh);
    grid-template-rows:
      auto auto minmax(0, 1fr) auto;
    padding: 20px;
  }

  .file-modal header,
  .file-modal footer {
    display: flex;
    justify-content: space-between;
    gap: 15px;
  }

  .file-modal h2 {
    margin: 0 0 4px;
    font-size: 1.06rem;
  }

  .file-modal header p,
  .file-modal footer span {
    margin: 0;
    color: var(--muted);
    font-size: 0.67rem;
  }

  .close-button {
    width: 34px;
    height: 34px;
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--muted);
    background: var(--surface-solid);
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
    border-bottom: 1px solid var(--border);
    color: var(--text);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .file-list button:hover {
    background: var(--accent-soft);
  }

  .file-list strong,
  .file-list code {
    display: block;
  }

  .file-list code {
    overflow: hidden;
    color: var(--muted);
    font-size: 0.65rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-icon {
    color: var(--lavender);
  }

  .browser-state {
    display: grid;
    min-height: 180px;
    place-items: center;
    color: var(--muted);
    font-size: 0.73rem;
  }

  .file-modal footer {
    align-items: center;
    padding-top: 12px;
  }

  @media (
    max-width: 1050px
  ) {
    .authoring-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (
    max-width: 700px
  ) {
    .form-toolbar,
    .arguments-heading,
    .file-modal footer {
      align-items: stretch;
      flex-direction: column;
    }

    .field-grid.two,
    .template-row,
    .argument-fields {
      grid-template-columns: 1fr;
    }
  }
</style>
