<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';

  type DefinitionKind = 'tool' | 'resource' | 'prompt';

  type ToolArgumentRow = {
    id: string;
    name: string;
    type: 'string' | 'number' | 'boolean';
    description: string;
    required: boolean;
  };

  type PromptArgumentRow = {
    id: string;
    name: string;
    description: string;
    required: boolean;
  };

  let {
    kind,
    definition,
    returnPath
  } = $props<{
    kind: DefinitionKind;
    definition: Record<string, any> & {
      name: string;
      enabled: boolean;
    };
    returnPath: string;
  }>();

  let editing = $state(false);
  let saving = $state(false);
  let toggling = $state(false);
  let deleting = $state(false);
  let errorMessage = $state('');

  let title = $state('');
  let description = $state('');

  let entrypoint = $state('');
  let cwd = $state('');
  let timeoutMs = $state(30000);
  let maxOutputKb = $state(1024);
  let argumentsMode = $state<'fields' | 'json-schema'>('fields');
  let toolArguments = $state<ToolArgumentRow[]>([]);
  let inputSchemaText = $state('{}');

  let resourceUri = $state('');
  let resourceMimeType = $state('text/plain');
  let resourceSource = $state('');

  let promptRole = $state<'user' | 'assistant'>('user');
  let promptTemplate = $state('');
  let promptArguments = $state<PromptArgumentRow[]>([]);

  function beginEdit() {
    errorMessage = '';
    title = definition.title ?? '';
    description = definition.description ?? '';

    if (kind === 'tool') {
      entrypoint = definition.entrypoint ?? '';
      cwd = definition.cwd ?? '';
      timeoutMs = definition.timeoutMs ?? 30000;
      maxOutputKb = Math.max(1, Math.round((definition.maxOutputBytes ?? 1024 * 1024) / 1024));
      argumentsMode = definition.argumentsMode === 'json-schema'
        ? 'json-schema'
        : 'fields';
      inputSchemaText = JSON.stringify(
        definition.inputSchema ?? {
          type: 'object',
          properties: {},
          additionalProperties: false
        },
        null,
        2
      );
      toolArguments = Object.entries(definition.arguments ?? {}).map(
        ([name, value]: [string, any]) => ({
          id: crypto.randomUUID(),
          name,
          type: value.type,
          description: value.description ?? '',
          required: Boolean(value.required)
        })
      );
    }

    if (kind === 'resource') {
      resourceUri = definition.uri ?? '';
      resourceMimeType = definition.mimeType ?? 'text/plain';
      resourceSource = definition.source ?? '';
    }

    if (kind === 'prompt') {
      promptRole = definition.role ?? 'user';
      promptTemplate = definition.template ?? '';
      promptArguments = Object.entries(definition.arguments ?? {}).map(
        ([name, value]: [string, any]) => ({
          id: crypto.randomUUID(),
          name,
          description: value.description ?? '',
          required: Boolean(value.required)
        })
      );
    }

    editing = true;
  }

  function addToolArgument() {
    toolArguments.push({
      id: crypto.randomUUID(),
      name: '',
      type: 'string',
      description: '',
      required: false
    });
  }

  function removeToolArgument(id: string) {
    const index = toolArguments.findIndex((argument) => argument.id === id);
    if (index >= 0) toolArguments.splice(index, 1);
  }

  function addPromptArgument() {
    promptArguments.push({
      id: crypto.randomUUID(),
      name: '',
      description: '',
      required: false
    });
  }

  function removePromptArgument(id: string) {
    const index = promptArguments.findIndex((argument) => argument.id === id);
    if (index >= 0) promptArguments.splice(index, 1);
  }

  function buildToolArguments() {
    const result: Record<string, any> = {};

    for (const argument of toolArguments) {
      const name = argument.name.trim();
      if (!name) throw new Error('Every tool argument needs a name.');
      if (!/^[A-Za-z0-9_-]+$/.test(name)) {
        throw new Error(`Tool argument "${name}" has an invalid name.`);
      }
      if (name in result) {
        throw new Error(`Tool argument "${name}" is declared more than once.`);
      }

      result[name] = {
        type: argument.type,
        description: argument.description.trim() || undefined,
        required: argument.required
      };
    }

    return result;
  }

  function buildPromptArguments() {
    const result: Record<string, any> = {};

    for (const argument of promptArguments) {
      const name = argument.name.trim();
      if (!name) throw new Error('Every prompt argument needs a name.');
      if (!/^[A-Za-z0-9_-]+$/.test(name)) {
        throw new Error(`Prompt argument "${name}" has an invalid name.`);
      }
      if (name in result) {
        throw new Error(`Prompt argument "${name}" is declared more than once.`);
      }

      result[name] = {
        description: argument.description.trim() || undefined,
        required: argument.required
      };
    }

    return result;
  }

  function buildUpdatedDefinition() {
    const common = {
      ...definition,
      title: title.trim() || undefined,
      description: description.trim()
    };

    if (kind === 'tool') {
      let inputSchema: Record<string, unknown> | undefined;

      if (argumentsMode === 'json-schema') {
        try {
          const parsed = JSON.parse(inputSchemaText);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Schema root must be a JSON object.');
          }
          if (parsed.type !== 'object') {
            throw new Error('Schema root type must be "object".');
          }
          inputSchema = parsed;
        } catch (error) {
          throw new Error(
            `Invalid input schema: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      return {
        ...common,
        entrypoint: entrypoint.trim(),
        cwd: cwd.trim() || undefined,
        timeoutMs: Number(timeoutMs),
        maxOutputBytes: Math.round(Number(maxOutputKb) * 1024),
        argumentsMode,
        arguments: argumentsMode === 'fields' ? buildToolArguments() : {},
        inputSchema: argumentsMode === 'json-schema' ? inputSchema : undefined
      };
    }

    if (kind === 'resource') {
      return {
        ...common,
        uri: resourceUri.trim(),
        mimeType: resourceMimeType,
        source: resourceSource.trim()
      };
    }

    return {
      ...common,
      role: promptRole,
      template: promptTemplate.trim(),
      arguments: buildPromptArguments()
    };
  }

  async function saveDefinition() {
    if (saving) return;

    errorMessage = '';
    saving = true;

    try {
      const payload = buildUpdatedDefinition();
      const response = await fetch(
        `/api/project/definitions/${kind}/${encodeURIComponent(definition.name)}`,
        {
          method: 'PUT',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? `Save failed (${response.status}).`);
      }

      editing = false;
      await invalidateAll();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      saving = false;
    }
  }

  async function toggleEnabled() {
    if (toggling) return;

    errorMessage = '';
    toggling = true;

    try {
      const response = await fetch(
        `/api/project/definitions/${kind}/${encodeURIComponent(definition.name)}`,
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            enabled: !definition.enabled
          })
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? `Update failed (${response.status}).`);
      }

      await invalidateAll();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      toggling = false;
    }
  }

  async function deleteDefinition() {
    if (deleting) return;

    const confirmed = confirm(
      `Delete the ${kind} definition "${definition.name}"?\n\nThe underlying source/template/resource file will NOT be deleted.`
    );
    if (!confirmed) return;

    deleting = true;
    errorMessage = '';

    try {
      const response = await fetch(
        `/api/project/definitions/${kind}/${encodeURIComponent(definition.name)}`,
        {
          method: 'DELETE'
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? `Delete failed (${response.status}).`);
      }

      await goto(returnPath, { invalidateAll: true });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      deleting = false;
    }
  }
</script>

<section class="lifecycle-bar glass-card">
  <div class="status-copy">
    <span
      class:enabled={definition.enabled}
      class:disabled={!definition.enabled}
      class="definition-status"
    >
      <span class="status-dot"></span>
      {definition.enabled ? 'Enabled' : 'Disabled'}
    </span>

    {#if !definition.enabled}
      <small>This definition remains editable but is not exposed by new MCP sessions.</small>
    {/if}
  </div>

  <div class="lifecycle-actions">
    <button
      class="secondary-button compact"
      type="button"
      onclick={beginEdit}
    >
      Edit
    </button>

    <button
      class="secondary-button compact"
      type="button"
      disabled={toggling}
      onclick={toggleEnabled}
    >
      {toggling
        ? 'Updating…'
        : definition.enabled
          ? 'Disable'
          : 'Enable'}
    </button>

    <button
      class="danger-button compact"
      type="button"
      disabled={deleting}
      onclick={deleteDefinition}
    >
      {deleting ? 'Deleting…' : 'Delete'}
    </button>
  </div>
</section>

{#if errorMessage && !editing}
  <div class="error-panel standalone">{errorMessage}</div>
{/if}

{#if editing}
  <section class="glass-card edit-card">
    <header class="edit-heading">
      <div>
        <div class="eyebrow">EDIT DEFINITION</div>
        <h2>{definition.name}</h2>
        <p>
          Name{kind === 'tool' ? ' and runtime are' : ' is'} locked for this release.
        </p>
      </div>

      <div class="edit-actions">
        <button
          class="secondary-button compact"
          type="button"
          disabled={saving}
          onclick={() => {
            editing = false;
            errorMessage = '';
          }}
        >
          Cancel
        </button>

        <button
          class="primary-button compact"
          type="button"
          disabled={saving}
          onclick={saveDefinition}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </header>

    <div class="locked-grid">
      <label>
        <span>Name</span>
        <input value={definition.name} disabled />
      </label>

      {#if kind === 'tool'}
        <label>
          <span>Runtime</span>
          <input value={definition.runtime} disabled />
        </label>
      {/if}
    </div>

    <div class="field-grid two">
      <label>
        <span>Title</span>
        <input bind:value={title} autocomplete="off" />
      </label>

      {#if kind === 'prompt'}
        <label>
          <span>Message role</span>
          <select bind:value={promptRole}>
            <option value="user">User</option>
            <option value="assistant">Assistant</option>
          </select>
        </label>
      {:else if kind === 'resource'}
        <label>
          <span>MIME type</span>
          <select bind:value={resourceMimeType}>
            <option value="text/markdown">Markdown — text/markdown</option>
            <option value="application/json">JSON — application/json</option>
            <option value="text/plain">Plain text — text/plain</option>
          </select>
        </label>
      {/if}
    </div>

    <label>
      <span>Description</span>
      <textarea bind:value={description} rows="3"></textarea>
    </label>

    {#if kind === 'tool'}
      <label>
        <span>Entrypoint</span>
        <input bind:value={entrypoint} autocomplete="off" />
      </label>

      <div class="field-grid three">
        <label>
          <span>Working directory</span>
          <input bind:value={cwd} autocomplete="off" placeholder="Project root" />
        </label>

        <label>
          <span>Timeout (ms)</span>
          <input bind:value={timeoutMs} type="number" min="1" max="300000" />
        </label>

        <label>
          <span>Max output (KB)</span>
          <input bind:value={maxOutputKb} type="number" min="1" max="16384" />
        </label>
      </div>

      <div class="separator"></div>

      <div class="argument-heading">
        <div>
          <div class="eyebrow">ARGUMENTS</div>
          <h3>Input definition</h3>
        </div>

        <select class="mode-select" bind:value={argumentsMode}>
          <option value="fields">Visual fields</option>
          <option value="json-schema">Advanced JSON Schema</option>
        </select>
      </div>

      {#if argumentsMode === 'json-schema'}
        <label>
          <span>Input JSON Schema</span>
          <small>
            Advanced schemas remain raw JSON because nested JSON Schema is intentionally not reproduced as a visual form.
          </small>
          <textarea
            class="schema-textarea"
            bind:value={inputSchemaText}
            rows="14"
            spellcheck="false"
          ></textarea>
        </label>
      {:else}
        <div class="argument-toolbar">
          <span>Edit flat string, number, and boolean arguments.</span>
          <button
            class="secondary-button compact"
            type="button"
            onclick={addToolArgument}
          >
            ＋ Add argument
          </button>
        </div>

        {#if toolArguments.length === 0}
          <div class="empty-arguments">No arguments.</div>
        {:else}
          <div class="argument-list">
            {#each toolArguments as argument (argument.id)}
              <article class="argument-row">
                <div class="argument-fields tool-fields">
                  <label>
                    <span>Name</span>
                    <input bind:value={argument.name} autocomplete="off" />
                  </label>

                  <label>
                    <span>Type</span>
                    <select bind:value={argument.type}>
                      <option value="string">String</option>
                      <option value="number">Number</option>
                      <option value="boolean">Boolean</option>
                    </select>
                  </label>

                  <label class="description-field">
                    <span>Description</span>
                    <input bind:value={argument.description} autocomplete="off" />
                  </label>

                  <label class="required-field">
                    <span>Required</span>
                    <span class="checkbox-row">
                      <input type="checkbox" bind:checked={argument.required} />
                      Yes
                    </span>
                  </label>
                </div>

                <button
                  class="remove-link"
                  type="button"
                  onclick={() => removeToolArgument(argument.id)}
                >
                  Remove
                </button>
              </article>
            {/each}
          </div>
        {/if}
      {/if}

    {:else if kind === 'resource'}
      <label>
        <span>URI</span>
        <input bind:value={resourceUri} autocomplete="off" />
      </label>

      <label>
        <span>Source file</span>
        <input bind:value={resourceSource} autocomplete="off" />
      </label>

    {:else}
      <label>
        <span>Template file</span>
        <input bind:value={promptTemplate} autocomplete="off" />
      </label>

      <div class="separator"></div>

      <div class="argument-toolbar">
        <div>
          <div class="eyebrow">ARGUMENTS</div>
          <span>Prompt arguments are string template parameters.</span>
        </div>

        <button
          class="secondary-button compact"
          type="button"
          onclick={addPromptArgument}
        >
          ＋ Add argument
        </button>
      </div>

      {#if promptArguments.length === 0}
        <div class="empty-arguments">No arguments.</div>
      {:else}
        <div class="argument-list">
          {#each promptArguments as argument (argument.id)}
            <article class="argument-row">
              <div class="argument-fields prompt-fields">
                <label>
                  <span>Name</span>
                  <input bind:value={argument.name} autocomplete="off" />
                </label>

                <label class="description-field">
                  <span>Description</span>
                  <input bind:value={argument.description} autocomplete="off" />
                </label>

                <label class="required-field">
                  <span>Required</span>
                  <span class="checkbox-row">
                    <input type="checkbox" bind:checked={argument.required} />
                    Yes
                  </span>
                </label>
              </div>

              <button
                class="remove-link"
                type="button"
                onclick={() => removePromptArgument(argument.id)}
              >
                Remove
              </button>
            </article>
          {/each}
        </div>
      {/if}
    {/if}

    {#if errorMessage}
      <div class="error-panel">{errorMessage}</div>
    {/if}
  </section>
{/if}

<style>
  .lifecycle-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 15px;
    padding: 10px 12px;
  }

  .status-copy {
    min-width: 0;
  }

  .status-copy small {
    display: block;
    margin-top: 3px;
    color: var(--muted);
    font-size: 0.62rem;
  }

  .definition-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.68rem;
    font-weight: 850;
  }

  .definition-status.enabled {
    color: var(--success);
  }

  .definition-status.disabled {
    color: var(--muted);
  }

  .lifecycle-actions,
  .edit-actions {
    display: flex;
    gap: 7px;
  }

  .compact {
    min-height: 34px;
    padding: 0 11px;
    font-size: 0.67rem;
  }

  .danger-button {
    min-height: 34px;
    padding: 0 11px;
    border: 1px solid
      color-mix(in srgb, var(--danger) 30%, var(--border));
    border-radius: 9px;
    color: var(--danger);
    background:
      color-mix(in srgb, var(--danger) 6%, transparent);
    font-size: 0.67rem;
    font-weight: 850;
    cursor: pointer;
  }

  .danger-button:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  .edit-card {
    margin-bottom: 15px;
    padding: 20px;
  }

  .edit-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 15px;
    margin-bottom: 17px;
  }

  .edit-heading h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  .edit-heading p {
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 0.68rem;
  }

  .field-grid,
  .locked-grid,
  .argument-fields {
    display: grid;
    gap: 11px;
  }

  .field-grid.two,
  .locked-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .field-grid.three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  label {
    display: block;
    margin-top: 13px;
  }

  .field-grid label,
  .locked-grid label,
  .argument-fields label {
    margin-top: 0;
  }

  label > span,
  label > small {
    display: block;
  }

  label > span {
    margin-bottom: 5px;
    font-size: 0.7rem;
    font-weight: 850;
  }

  label > small {
    margin-bottom: 6px;
    color: var(--muted);
    font-size: 0.63rem;
    line-height: 1.45;
  }

  input:not([type='checkbox']),
  textarea,
  select {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 9px;
    outline: none;
    color: var(--text);
    background:
      color-mix(in srgb, var(--surface-solid) 68%, transparent);
  }

  input:not([type='checkbox']),
  select {
    min-height: 39px;
    padding: 0 10px;
  }

  textarea {
    padding: 10px;
    resize: vertical;
  }

  input:disabled {
    color: var(--muted);
    opacity: 0.72;
  }

  .separator {
    height: 1px;
    margin: 21px 0;
    background: var(--border);
  }

  .argument-heading,
  .argument-toolbar {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }

  .argument-heading h3 {
    margin: 0;
    font-size: 0.95rem;
  }

  .mode-select {
    width: auto;
    min-width: 190px;
  }

  .argument-toolbar {
    align-items: center;
    margin-bottom: 10px;
  }

  .argument-toolbar span {
    color: var(--muted);
    font-size: 0.66rem;
  }

  .argument-list {
    display: grid;
    gap: 9px;
  }

  .argument-row {
    padding: 11px;
    border: 1px solid var(--border);
    border-radius: 10px;
  }

  .tool-fields {
    grid-template-columns: 140px 120px minmax(190px, 1fr) 105px;
  }

  .prompt-fields {
    grid-template-columns: 160px minmax(220px, 1fr) 105px;
  }

  .checkbox-row {
    display: flex;
    min-height: 39px;
    align-items: center;
    gap: 7px;
    padding: 0 9px;
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--muted);
    font-size: 0.65rem;
  }

  .checkbox-row input {
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
  }

  .remove-link {
    margin-top: 8px;
    padding: 0;
    border: 0;
    color: var(--danger);
    background: transparent;
    font-size: 0.62rem;
    font-weight: 850;
    cursor: pointer;
  }

  .empty-arguments {
    padding: 18px;
    border: 1px dashed var(--border);
    border-radius: 10px;
    color: var(--muted);
    font-size: 0.68rem;
    text-align: center;
  }

  .schema-textarea {
    font-family: "Cascadia Code", Consolas, monospace;
    font-size: 0.69rem;
    line-height: 1.5;
  }

  .error-panel {
    margin-top: 13px;
    padding: 10px 11px;
    border: 1px solid
      color-mix(in srgb, var(--danger) 32%, var(--border));
    border-radius: 9px;
    color: var(--danger);
    background: var(--danger-soft);
    font-size: 0.68rem;
  }

  .error-panel.standalone {
    margin: -5px 0 15px;
  }

  @media (max-width: 900px) {
    .field-grid.three,
    .tool-fields,
    .prompt-fields {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 680px) {
    .lifecycle-bar,
    .edit-heading,
    .argument-heading,
    .argument-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .lifecycle-actions,
    .edit-actions {
      flex-wrap: wrap;
    }

    .field-grid.two,
    .field-grid.three,
    .locked-grid,
    .tool-fields,
    .prompt-fields {
      grid-template-columns: 1fr;
    }

    .mode-select {
      width: 100%;
    }
  }
</style>
