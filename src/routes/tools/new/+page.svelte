<script lang="ts">
  import {
    goto
  } from '$app/navigation';

  type Runtime =
    | 'python'
    | 'bun'
    | 'node'
    | 'dotnet';

  type ActiveRuntime =
    | 'python'
    | 'bun'
    | 'node';

  type ArgumentType =
    | 'string'
    | 'number'
    | 'boolean';

  type ArgumentsMode =
    | 'fields'
    | 'json-schema';

  interface ArgumentRow {
    id: string;
    name: string;
    type: ArgumentType;
    description: string;
    required: boolean;
  }

  interface ProjectSourceFile {
    path: string;
    name: string;
    extension: string;
  }

  let name = $state('');
  let title = $state('');
  let description = $state('');

  let runtime = $state<Runtime>('python');
  let entrypoint = $state('');
  let cwd = $state('');
  let timeoutMs = $state(30_000);
  let maxOutputKb = $state(1024);

  let argumentsMode =
    $state<ArgumentsMode>('fields');

  let argumentRows =
    $state<ArgumentRow[]>([]);

  let jsonSchemaText = $state(`{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Example input."
    }
  },
  "required": ["query"],
  "additionalProperties": false
}`);

  let saving = $state(false);
  let errorMessage = $state('');

  let browseOpen = $state(false);
  let browseLoading = $state(false);
  let browseError = $state('');
  let browseFilter = $state('');
  let browseFiles =
    $state<ProjectSourceFile[]>([]);

  const activeRuntime = $derived(
    runtime === 'python' ||
    runtime === 'bun' ||
    runtime === 'node'
      ? runtime
      : null
  );

  const entrypointPlaceholder = $derived(
    runtime === 'python'
      ? './tools/python/my_tool.py'
      : runtime === 'node'
        ? './tools/node/my-tool.mjs'
        : './tools/bun/my-tool.ts'
  );

  const filteredBrowseFiles = $derived(
    browseFiles.filter((file) =>
      file.path
        .toLowerCase()
        .includes(
          browseFilter.trim().toLowerCase()
        )
    )
  );

  function addArgument() {
    argumentRows.push({
      id: crypto.randomUUID(),
      name: '',
      type: 'string',
      description: '',
      required: false
    });
  }

  function removeArgument(id: string) {
    const index = argumentRows.findIndex(
      (argument) => argument.id === id
    );

    if (index >= 0) {
      argumentRows.splice(index, 1);
    }
  }

  function buildArguments() {
    const result: Record<
      string,
      {
        type: ArgumentType;
        description?: string;
        required: boolean;
      }
    > = {};

    const usedNames = new Set<string>();

    for (const argument of argumentRows) {
      const argumentName =
        argument.name.trim();

      if (!argumentName) {
        throw new Error(
          'Every argument needs a name.'
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

      if (usedNames.has(argumentName)) {
        throw new Error(
          `Argument "${argumentName}" is declared more than once.`
        );
      }

      usedNames.add(argumentName);

      result[argumentName] = {
        type: argument.type,
        description:
          argument.description.trim() ||
          undefined,
        required: argument.required
      };
    }

    return result;
  }

  function buildJsonSchema():
    Record<string, unknown> {
    let parsed: unknown;

    try {
      parsed = JSON.parse(jsonSchemaText);
    } catch (error) {
      throw new Error(
        `Input JSON Schema is not valid JSON: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`
      );
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      throw new Error(
        'Input JSON Schema must be a JSON object.'
      );
    }

    const schema =
      parsed as Record<string, unknown>;

    if (schema.type !== 'object') {
      throw new Error(
        'Forge currently requires the root JSON Schema type to be "object".'
      );
    }

    return schema;
  }

  async function openBrowser() {
    if (!activeRuntime) {
      return;
    }

    browseOpen = true;
    browseLoading = true;
    browseError = '';
    browseFilter = '';

    try {
      const response = await fetch(
        `/api/project/files?runtime=${activeRuntime}`
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ??
            `Browse failed with status ${response.status}.`
        );
      }

      browseFiles = payload.files;
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
    file: ProjectSourceFile
  ) {
    entrypoint = file.path;
    browseOpen = false;
  }

  async function saveTool() {
    errorMessage = '';

    try {
      const trimmedName = name.trim();
      const trimmedEntrypoint =
        entrypoint.trim();

      if (!trimmedName) {
        throw new Error(
          'Tool name is required.'
        );
      }

      if (
        !/^[A-Za-z0-9_-]+$/.test(
          trimmedName
        )
      ) {
        throw new Error(
          'Tool names may contain only letters, numbers, underscores, and hyphens.'
        );
      }

      if (!activeRuntime) {
        throw new Error(
          'That runtime is not implemented yet.'
        );
      }

      if (!trimmedEntrypoint) {
        throw new Error(
          'Entrypoint is required.'
        );
      }

      if (
        !Number.isInteger(timeoutMs) ||
        timeoutMs <= 0
      ) {
        throw new Error(
          'Timeout must be a positive whole number of milliseconds.'
        );
      }

      if (
        !Number.isFinite(maxOutputKb) ||
        maxOutputKb <= 0
      ) {
        throw new Error(
          'Maximum output must be greater than zero.'
        );
      }

      const payload = {
        name: trimmedName,
        title:
          title.trim() || undefined,
        description: description.trim(),
        enabled: true,
        runtime: activeRuntime,
        entrypoint: trimmedEntrypoint,
        cwd: cwd.trim() || undefined,
        timeoutMs,
        maxOutputBytes:
          Math.round(maxOutputKb * 1024),

        argumentsMode,

        arguments:
          argumentsMode === 'fields'
            ? buildArguments()
            : {},

        inputSchema:
          argumentsMode === 'json-schema'
            ? buildJsonSchema()
            : undefined
      };

      saving = true;

      const response = await fetch(
        '/api/project/tools',
        {
          method: 'POST',
          headers: {
            'content-type':
              'application/json'
          },
          body: JSON.stringify(payload)
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ??
            `Save failed with status ${response.status}.`
        );
      }

      await goto(
        `/tools/${encodeURIComponent(trimmedName)}`
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
  <title>Modern MCP Forge · Add Tool</title>
</svelte:head>

<section class="page-heading">
  <div>
    <div class="eyebrow">AUTHORING</div>
    <h1>Add tool</h1>
    <p>
      Declare an existing capability or create the definition first and initialize its source later.
    </p>
  </div>
</section>

<div class="form-toolbar glass-card">
  <div>
    <strong>New tool definition</strong>
    <span>
      Changes are written to the Git-tracked project manifest.
    </span>
  </div>

  <div class="toolbar-actions">
    <a
      class="secondary-button"
      href="/tools"
    >
      Cancel
    </a>

    <button
      class="primary-button"
      type="submit"
      form="tool-authoring-form"
      disabled={saving}
    >
      {saving
        ? 'Saving…'
        : 'Save tool →'}
    </button>
  </div>
</div>

<form
  id="tool-authoring-form"
  class="authoring-grid"
  onsubmit={(event) => {
    event.preventDefault();
    saveTool();
  }}
>
  <section class="glass-card form-card">
    <div class="section-heading">
      <div class="eyebrow">IDENTITY</div>
      <h2>Tool definition</h2>
    </div>

    <div class="field-grid two">
      <label>
        <span>Name <em>*</em></span>
        <small>
          Stable MCP tool identifier.
        </small>
        <input
          bind:value={name}
          required
          autocomplete="off"
          placeholder="customer_search"
        />
      </label>

      <label>
        <span>Title</span>
        <small>
          Human-friendly display name.
        </small>
        <input
          bind:value={title}
          autocomplete="off"
          placeholder="Customer Search"
        />
      </label>
    </div>

    <label>
      <span>Description</span>
      <small>
        Describe when an agent should use this capability.
      </small>
      <textarea
        bind:value={description}
        rows="4"
        placeholder="Search customers in the internal CRM..."
      ></textarea>
    </label>

    <div class="separator"></div>

    <div class="section-heading">
      <div class="eyebrow">RUNTIME</div>
      <h2>Execution</h2>
    </div>

    <label>
      <span>Execution runtime <em>*</em></span>
      <small>
        More runtimes can be added without changing the Forge Tool ABI.
      </small>

      <select bind:value={runtime}>
        <option value="python">
          Python
        </option>
        <option value="bun">
          Bun / TypeScript
        </option>
        <option value="node">
          Node.js
        </option>
        <option value="dotnet" disabled>
          .NET — coming soon
        </option>
      </select>
    </label>

    <div class="runtime-note">
      <span class="runtime-badge {activeRuntime ?? ''}">
        {runtime}
      </span>
      <span>
        {runtime === 'python'
          ? 'Python subprocess through Forge Tool ABI.'
          : runtime === 'bun'
            ? 'Bun/TypeScript subprocess through Forge Tool ABI.'
            : runtime === 'node'
              ? 'Node.js subprocess through Forge Tool ABI.'
              : 'Reserved runtime — not enabled yet.'}
      </span>
    </div>

    <label>
      <span>Entrypoint <em>*</em></span>
      <small>
        Relative to forge.project.json, or manually enter an external/absolute path.
      </small>

      <div class="entrypoint-row">
        <input
          bind:value={entrypoint}
          required
          autocomplete="off"
          placeholder={entrypointPlaceholder}
        />

        <button
          class="secondary-button browse-button"
          type="button"
          disabled={!activeRuntime}
          onclick={openBrowser}
        >
          Browse project…
        </button>
      </div>
    </label>

    <label>
      <span>Working directory</span>
      <small>
        Optional. Relative to the project root unless an absolute path is used.
      </small>
      <input
        bind:value={cwd}
        autocomplete="off"
        placeholder="."
      />
    </label>

    <div class="field-grid two">
      <label>
        <span>Timeout</span>
        <small>
          Maximum execution time in milliseconds.
        </small>
        <input
          type="number"
          min="1"
          max="300000"
          step="1"
          bind:value={timeoutMs}
        />
      </label>

      <label>
        <span>Maximum output</span>
        <small>
          Combined process output allowance in KB.
        </small>
        <input
          type="number"
          min="1"
          max="16384"
          step="1"
          bind:value={maxOutputKb}
        />
      </label>
    </div>
  </section>

  <section class="glass-card arguments-card">
    <div class="section-heading">
      <div class="eyebrow">INPUT SCHEMA</div>
      <h2>Arguments</h2>
      <p class="section-description">
        Use the visual builder for simple tools, or provide a raw JSON Schema for advanced inputs.
      </p>
    </div>

    <div class="mode-switch">
      <button
        type="button"
        class:active={argumentsMode === 'fields'}
        onclick={() =>
          (argumentsMode = 'fields')}
      >
        Visual fields
        <small>
          Flat string, number, boolean inputs
        </small>
      </button>

      <button
        type="button"
        class:active={argumentsMode === 'json-schema'}
        onclick={() =>
          (argumentsMode = 'json-schema')}
      >
        JSON Schema
        <small>
          Advanced / nested input contract
        </small>
      </button>
    </div>

    {#if argumentsMode === 'fields'}
      <div class="arguments-heading">
        <p>
          These fields become both the MCP input schema and the generated Workbench test form.
        </p>

        <button
          class="secondary-button compact"
          type="button"
          onclick={addArgument}
        >
          ＋ Add argument
        </button>
      </div>

      {#if argumentRows.length === 0}
        <div class="empty-state">
          <strong>No arguments yet.</strong>
          <span>
            This tool will be callable without input.
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
                  <span>Name <em>*</em></span>
                  <input
                    bind:value={argument.name}
                    required
                    autocomplete="off"
                    placeholder="query"
                  />
                </label>

                <label>
                  <span>Type</span>
                  <select
                    bind:value={argument.type}
                  >
                    <option value="string">
                      string
                    </option>
                    <option value="number">
                      number
                    </option>
                    <option value="boolean">
                      boolean
                    </option>
                  </select>
                </label>

                <label class="description-field">
                  <span>Description</span>
                  <input
                    bind:value={argument.description}
                    autocomplete="off"
                    placeholder="What this argument controls..."
                  />
                </label>

                <label class="required-field">
                  <span>Required</span>
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
    {:else}
      <div class="schema-mode">
        <div class="advanced-note">
          <strong>
            Advanced input contract
          </strong>
          <span>
            Forge will pass this schema directly to MCP. The Workbench will not generate nested form controls from it.
          </span>
        </div>

        <label>
          <span>Input JSON Schema <em>*</em></span>
          <small>
            Root type must currently be object. Nested properties, arrays, enums, constraints, and composition keywords may be used.
          </small>
          <textarea
            class="schema-editor"
            bind:value={jsonSchemaText}
            rows="22"
            spellcheck="false"
          ></textarea>
        </label>
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
      aria-labelledby="file-browser-title"
    >
      <header>
        <div>
          <div class="eyebrow">PROJECT FILES</div>
          <h2 id="file-browser-title">
            Choose entrypoint
          </h2>
          <p>
            Only files compatible with the selected runtime are shown.
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
        placeholder="Filter project files..."
      />

      {#if browseLoading}
        <div class="browser-state">
          Scanning project…
        </div>
      {:else if browseError}
        <div class="error-panel">
          {browseError}
        </div>
      {:else if filteredBrowseFiles.length === 0}
        <div class="browser-state">
          No compatible source files found.
        </div>
      {:else}
        <div class="file-list">
          {#each filteredBrowseFiles as file}
            <button
              type="button"
              onclick={() =>
                chooseFile(file)}
            >
              <span class="file-icon">
                ◇
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

  .authoring-grid {
    display: grid;
    grid-template-columns:
      minmax(420px, 0.95fr)
      minmax(420px, 1.05fr);
    gap: 16px;
    align-items: start;
  }

  .form-card,
  .arguments-card {
    min-width: 0;
    padding: 23px;
  }

  .section-heading {
    margin-bottom: 18px;
  }

  .section-heading h2 {
    margin: 0;
    font-size: 1.08rem;
  }

  .section-description {
    margin: 6px 0 0;
    color: var(--muted);
    font-size: 0.71rem;
    line-height: 1.5;
  }

  .field-grid {
    display: grid;
    gap: 13px;
  }

  .field-grid.two {
    grid-template-columns: 1fr 1fr;
  }

  label {
    display: block;
    margin-top: 14px;
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
    min-height: 28px;
    margin-bottom: 7px;
    color: var(--muted);
    font-size: 0.66rem;
    line-height: 1.4;
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
    background: color-mix(
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

  input:focus,
  textarea:focus,
  select:focus {
    border-color: color-mix(
      in srgb,
      var(--accent) 55%,
      var(--border)
    );
    box-shadow: 0 0 0 3px
      color-mix(
        in srgb,
        var(--accent) 12%,
        transparent
      );
  }

  .separator {
    height: 1px;
    margin: 24px 0;
    background: var(--border);
  }

  .runtime-note {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-top: 9px;
    color: var(--muted);
    font-size: 0.68rem;
  }

  .entrypoint-row {
    display: grid;
    grid-template-columns:
      minmax(0, 1fr) auto;
    gap: 8px;
  }

  .browse-button {
    white-space: nowrap;
  }

  .mode-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 9px;
    margin-bottom: 18px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 13px;
    background: color-mix(
      in srgb,
      var(--surface-solid) 38%,
      transparent
    );
  }

  .mode-switch button {
    padding: 12px;
    border: 0;
    border-radius: 9px;
    color: var(--muted);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .mode-switch button.active {
    color: var(--accent);
    background: var(--accent-soft);
    box-shadow: var(--shadow-soft);
  }

  .mode-switch button,
  .mode-switch small {
    display: block;
  }

  .mode-switch button {
    font-size: 0.74rem;
    font-weight: 850;
  }

  .mode-switch small {
    margin-top: 3px;
    color: var(--muted);
    font-size: 0.62rem;
    font-weight: 650;
  }

  .arguments-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 15px;
  }

  .arguments-heading p {
    max-width: 520px;
    margin: 0;
    color: var(--muted);
    font-size: 0.71rem;
    line-height: 1.5;
  }

  .compact {
    min-height: 36px;
    padding-inline: 11px;
    white-space: nowrap;
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
    background: color-mix(
      in srgb,
      var(--surface-solid) 32%,
      transparent
    );
  }

  .empty-state strong {
    color: var(--text);
    font-size: 0.82rem;
  }

  .empty-state span {
    margin-bottom: 8px;
    font-size: 0.72rem;
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
    background: color-mix(
      in srgb,
      var(--surface-solid) 46%,
      transparent
    );
  }

  .argument-topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .argument-topline strong {
    overflow: hidden;
    font-size: 0.75rem;
    text-overflow: ellipsis;
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
    grid-template-columns: 1fr 130px;
  }

  .description-field {
    grid-column: 1;
  }

  .required-field {
    grid-column: 2;
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
    background: color-mix(
      in srgb,
      var(--surface-solid) 56%,
      transparent
    );
    font-size: 0.68rem;
    font-weight: 700;
  }

  .checkbox-row input {
    width: 17px;
    height: 17px;
    accent-color: var(--accent);
  }

  .advanced-note {
    display: flex;
    gap: 9px;
    margin-bottom: 4px;
    padding: 11px 12px;
    border: 1px solid
      color-mix(
        in srgb,
        var(--accent) 24%,
        var(--border)
      );
    border-radius: 10px;
    background: color-mix(
      in srgb,
      var(--accent) 6%,
      var(--surface)
    );
  }

  .advanced-note strong {
    flex: 0 0 auto;
    color: var(--accent);
    font-size: 0.7rem;
  }

  .advanced-note span {
    color: var(--muted);
    font-size: 0.68rem;
    line-height: 1.45;
  }

  .schema-editor {
    min-height: 390px;
    font-family:
      "Cascadia Code",
      "SFMono-Regular",
      Consolas,
      monospace;
    font-size: 0.73rem;
    line-height: 1.55;
    tab-size: 2;
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
    font-size: 0.73rem;
    line-height: 1.5;
  }

  .modal-backdrop {
    position: fixed;
    z-index: 100;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgb(5 8 14 / 0.46);
    backdrop-filter: blur(6px);
  }

  .file-modal {
    display: grid;
    width: min(780px, 100%);
    max-height: min(760px, 88vh);
    grid-template-rows:
      auto auto minmax(0, 1fr) auto;
    padding: 20px;
    box-shadow: var(--shadow);
  }

  .file-modal header {
    display: flex;
    justify-content: space-between;
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
    grid-template-columns: 22px minmax(0, 1fr);
    gap: 9px;
    padding: 11px 12px;
    border: 0;
    border-bottom: 1px solid var(--border);
    color: var(--text);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .file-list button:last-child {
    border-bottom: 0;
  }

  .file-list button:hover {
    background: var(--accent-soft);
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

  @media (max-width: 1060px) {
    .authoring-grid {
      grid-template-columns: 1fr;
    }

    .form-toolbar {
      top: 72px;
    }
  }

  @media (max-width: 620px) {
    .form-toolbar,
    .arguments-heading,
    .file-modal footer {
      align-items: stretch;
      flex-direction: column;
    }

    .toolbar-actions {
      width: 100%;
    }

    .toolbar-actions > * {
      flex: 1;
    }

    .field-grid.two,
    .argument-fields,
    .mode-switch,
    .entrypoint-row {
      grid-template-columns: 1fr;
    }

    .description-field,
    .required-field {
      grid-column: 1;
    }

    .modal-backdrop {
      padding: 10px;
    }

    .file-modal {
      max-height: 94vh;
    }
  }
</style>
