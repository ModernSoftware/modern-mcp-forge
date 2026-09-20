<script lang="ts">
  import MonacoEditor from '$lib/components/MonacoEditor.svelte';
  import InContextDefinitionEditor from '$lib/components/InContextDefinitionEditor.svelte';

  let { data } = $props();

  type Tab =
    | 'overview'
    | 'code'
    | 'test';

  let tab = $state<Tab>('overview');

  let argumentEntries = $derived(
    Object.entries(data.tool.arguments)
  );

  let usesJsonSchema = $derived(
    data.tool.argumentsMode ===
      'json-schema'
  );

  let values =
    $state<
      Record<
        string,
        string | number | boolean
      >
    >({});

  $effect(() => {
    values = Object.fromEntries(
      argumentEntries.map(
        ([name, definition]) => [
          name,
          definition.type === 'boolean'
            ? false
            : ''
        ]
      )
    );
  });

  let rawArgumentsText = $state('{}');

  let running = $state(false);
  let clientError = $state('');
  let execution = $state<any>(null);

  let sourceLoading = $state(false);
  let sourceSaving = $state(false);
  let sourceCreating = $state(false);
  let sourceError = $state('');
  let sourceContent = $state('');
  let sourceOriginal = $state('');
  let sourceLoaded = $state(false);
  let sourceExists = $state(false);
  let sourceToolKey = $state('');

  $effect(() => {
    const nextSourceKey = `${data.tool.name}:${data.source.resolvedPath ?? ''}`;

    if (
      sourceToolKey !== nextSourceKey
    ) {
      sourceToolKey = nextSourceKey;
      sourceExists =
        data.source.exists;
      sourceContent = '';
      sourceOriginal = '';
      sourceLoaded = false;
      sourceError = '';
      execution = null;
      rawArgumentsText = '{}';
      tab = 'overview';
    }
  });

  const sourceDirty = $derived(
    sourceLoaded &&
      sourceContent !== sourceOriginal
  );

  async function openCodeTab() {
    tab = 'code';

    if (
      !sourceLoaded &&
      data.source.editable &&
      sourceExists
    ) {
      await loadSource();
    }
  }

  async function loadSource() {
    sourceLoading = true;
    sourceError = '';

    try {
      const response = await fetch(
        `/api/project/tools/${encodeURIComponent(data.tool.name)}/source`
      );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ??
            `Source load failed with status ${response.status}.`
        );
      }

      sourceExists =
        Boolean(payload.info.exists);
      sourceContent =
        payload.content ?? '';
      sourceOriginal =
        sourceContent;
      sourceLoaded =
        payload.content !== null;
    } catch (error) {
      sourceError =
        error instanceof Error
          ? error.message
          : String(error);
    } finally {
      sourceLoading = false;
    }
  }

  async function createStarterSource() {
    sourceCreating = true;
    sourceError = '';

    try {
      const response = await fetch(
        `/api/project/tools/${encodeURIComponent(data.tool.name)}/source`,
        {
          method: 'POST'
        }
      );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ??
            `Source creation failed with status ${response.status}.`
        );
      }

      sourceExists = true;
      sourceContent = payload.content;
      sourceOriginal = payload.content;
      sourceLoaded = true;
    } catch (error) {
      sourceError =
        error instanceof Error
          ? error.message
          : String(error);
    } finally {
      sourceCreating = false;
    }
  }

  async function saveSource() {
    if (
      !sourceLoaded ||
      !sourceDirty ||
      sourceSaving
    ) {
      return;
    }

    sourceSaving = true;
    sourceError = '';

    try {
      const response = await fetch(
        `/api/project/tools/${encodeURIComponent(data.tool.name)}/source`,
        {
          method: 'PUT',
          headers: {
            'content-type':
              'application/json'
          },
          body: JSON.stringify({
            content: sourceContent
          })
        }
      );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ??
            `Source save failed with status ${response.status}.`
        );
      }

      sourceOriginal =
        sourceContent;
    } catch (error) {
      sourceError =
        error instanceof Error
          ? error.message
          : String(error);
    } finally {
      sourceSaving = false;
    }
  }

  function buildArguments():
    Record<string, unknown> {
    if (usesJsonSchema) {
      let parsed: unknown;

      try {
        parsed =
          JSON.parse(rawArgumentsText);
      } catch (error) {
        throw new Error(
          `Arguments are not valid JSON: ${
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
          'Arguments must be a JSON object.'
        );
      }

      return parsed as Record<
        string,
        unknown
      >;
    }

    const args: Record<
      string,
      unknown
    > = {};

    for (
      const [name, definition]
      of argumentEntries
    ) {
      const value = values[name];

      if (
        definition.type === 'boolean'
      ) {
        args[name] =
          Boolean(value);
        continue;
      }

      if (
        value === '' ||
        value === undefined
      ) {
        continue;
      }

      args[name] =
        definition.type === 'number'
          ? Number(value)
          : value;
    }

    return args;
  }

  async function runTool() {
    running = true;
    clientError = '';
    execution = null;

    try {
      const args = buildArguments();

      const response = await fetch(
        `/api/tools/${encodeURIComponent(data.tool.name)}/execute`,
        {
          method: 'POST',
          headers: {
            'content-type':
              'application/json'
          },
          body: JSON.stringify({
            arguments: args
          })
        }
      );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ??
            `Request failed with status ${response.status}.`
        );
      }

      execution = payload;
    } catch (error) {
      clientError =
        error instanceof Error
          ? error.message
          : String(error);
    } finally {
      running = false;
    }
  }

  function resultText() {
    if (
      !execution?.result?.content
    ) {
      return '';
    }

    return execution.result.content
      .filter(
        (block: any) =>
          block.type === 'text'
      )
      .map(
        (block: any) =>
          block.text
      )
      .join('\n');
  }

  function updateBooleanArgument(name: string, event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    values[name] = input.checked;
  }

  function updateValueArgument(name: string, event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    values[name] = input.value;
}
</script>

<svelte:head>
  <title>
    Modern MCP Forge · {data.tool.name}
  </title>
</svelte:head>

<section class="page-heading">
  <div>
    <div class="eyebrow">
      {data.tool.runtime.toUpperCase()} TOOL
    </div>
    <h1>
      {data.tool.title ??
        data.tool.name}
    </h1>
    <p>
      {data.tool.description}
    </p>
  </div>

  <div class="heading-status">
    <span
      class="runtime-badge {data.tool.runtime}"
    >
      {data.tool.runtime}
    </span>

    <span
      class:status-ready={
        data.tool.runtimeStatus.ready
      }
      class:status-failed={
        !data.tool.runtimeStatus.ready
      }
    >
      <span class="status-dot"></span>
      {data.tool.runtimeStatus.ready
        ? 'Ready'
        : 'Unavailable'}
    </span>
  </div>
</section>

<InContextDefinitionEditor
  kind="tool"
  definition={data.tool}
  returnPath="/tools"
/>

<nav
  class="tool-tabs glass-card"
  aria-label="Tool sections"
>
  <button
    class:active={tab === 'overview'}
    type="button"
    onclick={() =>
      (tab = 'overview')}
  >
    Overview
  </button>

  <button
    class:active={tab === 'code'}
    type="button"
    onclick={openCodeTab}
  >
    Code
    {#if sourceDirty}
      <span
        class="dirty-dot"
        title="Unsaved changes"
      ></span>
    {/if}
  </button>

  <button
    class:active={tab === 'test'}
    type="button"
    disabled={!data.tool.enabled}
    title={data.tool.enabled ? 'Test tool' : 'Enable this tool before testing it'}
    onclick={() =>
      (tab = 'test')}
  >
    Test
  </button>
</nav>

{#if tab === 'overview'}
  <section class="glass-card detail-card">
    <div class="section-heading">
      <div>
        <div class="eyebrow">
          DEFINITION
        </div>
        <h2>
          Tool configuration
        </h2>
      </div>
    </div>

    <dl>
      <div>
        <dt>Name</dt>
        <dd>
          <code>
            {data.tool.name}
          </code>
        </dd>
      </div>

      <div>
        <dt>Runtime</dt>
        <dd>
          {data.tool.runtime}
        </dd>
      </div>

      <div>
        <dt>Entrypoint</dt>
        <dd>
          <code>{data.tool.entrypoint}</code>
        </dd>
      </div>

      <div>
        <dt>Timeout</dt>
        <dd>
          {data.tool.timeoutMs.toLocaleString()}
          ms
        </dd>
      </div>

      <div>
        <dt>Maximum output</dt>
        <dd>
          {Math.round(
            data.tool.maxOutputBytes /
              1024
          ).toLocaleString()}
          KB
        </dd>
      </div>

      <div>
        <dt>Runtime resolution</dt>
        <dd>
          <code>
            {data.tool.runtimeStatus.detail}
          </code>
        </dd>
      </div>
    </dl>

    <div class="arguments">
      <div class="eyebrow">
        ARGUMENT SCHEMA
      </div>

      {#if usesJsonSchema}
        <div class="advanced-schema-summary">
          <div>
            <strong>
              Advanced JSON Schema
            </strong>
            <span>
              Forge does not generate nested controls for this schema.
            </span>
          </div>

          <pre class="code-block">{JSON.stringify(data.tool.inputSchema, null, 2)}</pre>
        </div>
      {:else if argumentEntries.length === 0}
        <p class="empty">
          This tool has no arguments.
        </p>
      {:else}
        {#each argumentEntries as [name, definition]}
          <div class="argument-definition">
            <div>
              <strong>
                {name}
              </strong>
              {#if definition.required}
                <span>
                  required
                </span>
              {/if}
            </div>

            <code>
              {definition.type}
            </code>

            <p>
              {definition.description ??
                'No description.'}
            </p>
          </div>
        {/each}
      {/if}
    </div>
  </section>

{:else if tab === 'code'}
  <section class="glass-card code-card">
    {#if !data.source.editable}
      <div class="empty-editor">
        <div class="eyebrow">
          SOURCE
        </div>
        <h2>
          Source editing is not available for this runtime.
        </h2>
        <p>
          This runtime does not currently provide Forge source-file authoring support.
        </p>
      </div>
    {:else}
      <header class="code-heading">
        <div>
          <div class="eyebrow">
            SOURCE
          </div>
          <h2>
            {data.source.declaredEntrypoint}
          </h2>
          <p>
            {data.source.resolvedPath}
          </p>
        </div>

        <div class="code-actions">
          {#if sourceDirty}
            <span class="unsaved">
              Unsaved
            </span>
          {/if}

          <button
            class="primary-button"
            type="button"
            disabled={
              !sourceDirty ||
              sourceSaving
            }
            onclick={saveSource}
          >
            {sourceSaving
              ? 'Saving…'
              : 'Save source'}
          </button>
        </div>
      </header>

      {#if data.source.external}
        <div class="external-warning">
          <strong>
            External source
          </strong>
          <span>
            This file is outside the Forge project. Saving here modifies the original file.
          </span>
        </div>
      {/if}

      {#if sourceError}
        <div class="error-panel">
          {sourceError}
        </div>
      {/if}

      {#if sourceLoading}
        <div class="loading-panel">
          Loading source…
        </div>
      {:else if !sourceExists}
        <div class="missing-source">
          <div class="missing-icon">
            ⌁
          </div>
          <h2>
            Source file does not exist yet.
          </h2>
          <p>
            Forge can create an ABI-compatible {data.tool.runtime} starter at the declared entrypoint.
          </p>
          <code>
            {data.source.resolvedPath}
          </code>

          <button
            class="primary-button"
            type="button"
            disabled={sourceCreating}
            onclick={createStarterSource}
          >
            {sourceCreating
              ? 'Creating…'
              : `Create ${data.tool.runtime} starter`}
          </button>
        </div>
      {:else if sourceLoaded}
        <MonacoEditor
          value={sourceContent}
          language={data.source.language}
          onChange={(value) =>
            (sourceContent = value)}
          onSave={saveSource}
        />

        <div class="editor-footer">
          <span>
            {sourceDirty
              ? 'Unsaved changes'
              : 'Saved'}
          </span>
          <span>
            Ctrl/Cmd + S to save
          </span>
        </div>
      {:else}
        <button
          class="secondary-button"
          type="button"
          onclick={loadSource}
        >
          Load source
        </button>
      {/if}
    {/if}
  </section>

{:else}
  <section class="glass-card test-card">
    <div class="section-heading">
      <div>
        <div class="eyebrow">
          WORKBENCH
        </div>
        <h2>Test tool</h2>
      </div>
    </div>

    <form
      onsubmit={(event) => {
        event.preventDefault();
        runTool();
      }}
    >
      {#if usesJsonSchema}
        <div class="advanced-test-note">
          <strong>
            JSON Schema input
          </strong>
          <span>
            Forge intentionally does not generate nested controls. Enter the complete arguments object below; MCP will validate it against the declared schema.
          </span>
        </div>

        <label>
          <span>
            Arguments JSON
          </span>
          <small>
            Supply one JSON object matching the tool input schema.
          </small>
          <textarea
            class="raw-arguments"
            bind:value={rawArgumentsText}
            rows="14"
            spellcheck="false"
          ></textarea>
        </label>
      {:else if argumentEntries.length === 0}
        <p class="empty">
          No input is required. Run the tool directly.
        </p>
      {:else}
        <div class="form-grid">
          {#each argumentEntries as [name, definition]}
            <label>
              <span>
                {name}
                {#if definition.required}
                  <em>*</em>
                {/if}
              </span>

              <small>
                {definition.description}
              </small>

              {#if definition.type === 'boolean'}
                <input
                  type="checkbox"
                  checked={
                    Boolean(values[name])
                  }
                  onchange={(event) => updateBooleanArgument(name, event)}
                />
              {:else}
                <input
                  type={
                    definition.type === 'number'
                      ? 'number'
                      : 'text'
                  }
                  required={
                    definition.required
                  }
                  value={
                    String(
                      values[name] ?? ''
                    )
                  }
                  oninput={(event) => updateValueArgument(name, event)}
                />
              {/if}
            </label>
          {/each}
        </div>
      {/if}

      <div class="run-row">
        <button
          class="primary-button"
          type="submit"
          disabled={
            running ||
            !data.tool.runtimeStatus.ready
          }
        >
          {running
            ? 'Running…'
            : 'Run tool →'}
        </button>
      </div>
    </form>

    {#if clientError}
      <div class="error-panel">
        {clientError}
      </div>
    {/if}

    {#if execution}
      <section
        class="result"
        class:failed={
          execution.status !==
            'succeeded'
        }
      >
        <header>
          <span
            class:status-success={
              execution.status ===
                'succeeded'
            }
            class:status-failed={
              execution.status !==
                'succeeded'
            }
          >
            <span class="status-dot"></span>
            {execution.status}
          </span>

          <div>
            <span>
              {execution.durationMs}
              ms
            </span>
            <a
              href={`/executions/${execution.databaseId}`}
            >
              Execution #{execution.databaseId} →
            </a>
          </div>
        </header>

        <div class="result-block">
          <div class="result-label">
            RESULT
          </div>
          <pre class="code-block">{resultText() || '(No text content)'}</pre>
        </div>

        {#if execution.result?.structuredContent}
          <div class="result-block">
            <div class="result-label">
              STRUCTURED CONTENT
            </div>
            <pre class="code-block">{JSON.stringify(execution.result.structuredContent, null, 2)}</pre>
          </div>
        {/if}

        {#if execution.stderr}
          <div class="result-block">
            <div class="result-label">
              STDERR
            </div>
            <pre class="code-block">{execution.stderr}</pre>
          </div>
        {/if}
      </section>
    {/if}
  </section>
{/if}

<style>
  .heading-status {
    display: flex;
    align-items: center;
    gap: 11px;
  }

  .tool-tabs {
    display: flex;
    gap: 5px;
    margin-bottom: 16px;
    padding: 5px;
    width: max-content;
    max-width: 100%;
  }

  .tool-tabs button {
    position: relative;
    min-height: 36px;
    padding: 0 14px;
    border: 0;
    border-radius: 9px;
    color: var(--muted);
    background: transparent;
    font-size: 0.73rem;
    font-weight: 850;
    cursor: pointer;
  }

  .tool-tabs button.active {
    color: var(--accent);
    background: var(--accent-soft);
  }

  .tool-tabs button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .dirty-dot {
    position: absolute;
    top: 7px;
    right: 6px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--warning);
  }

  .detail-card,
  .test-card,
  .code-card {
    min-width: 0;
    padding: 22px;
  }

  .section-heading {
    margin-bottom: 18px;
  }

  .section-heading h2 {
    margin: 0;
    font-size: 1.08rem;
  }

  dl {
    margin: 0;
    display: grid;
    gap: 1px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 11px;
    background: var(--border);
  }

  dl div {
    display: grid;
    grid-template-columns: 130px minmax(0, 1fr);
    gap: 14px;
    padding: 12px;
    background: color-mix(
      in srgb,
      var(--surface-solid) 56%,
      transparent
    );
  }

  dt {
    color: var(--muted);
    font-size: 0.68rem;
    font-weight: 800;
  }

  dd {
    min-width: 0;
    margin: 0;
    font-size: 0.72rem;
  }

  dd code {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .arguments {
    margin-top: 22px;
  }

  .argument-definition {
    display: grid;
    grid-template-columns:
      minmax(0, 1fr) auto;
    gap: 5px 12px;
    padding: 12px 0;
    border-bottom:
      1px solid var(--border);
  }

  .argument-definition:last-child {
    border-bottom: 0;
  }

  .argument-definition strong {
    font-size: 0.78rem;
  }

  .argument-definition span {
    margin-left: 7px;
    color: var(--accent);
    font-size: 0.62rem;
    font-weight: 850;
  }

  .argument-definition code {
    color: var(--muted);
    font-size: 0.68rem;
  }

  .argument-definition p {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--muted);
    font-size: 0.7rem;
  }

  .advanced-schema-summary {
    margin-top: 9px;
  }

  .advanced-schema-summary > div {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 9px;
  }

  .advanced-schema-summary strong {
    font-size: 0.76rem;
  }

  .advanced-schema-summary span {
    color: var(--muted);
    font-size: 0.67rem;
  }

  .empty {
    margin: 0;
    color: var(--muted);
    font-size: 0.76rem;
  }

  .code-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 15px;
  }

  .code-heading h2 {
    margin: 0 0 4px;
    font-size: 1rem;
  }

  .code-heading p {
    margin: 0;
    color: var(--muted);
    font-family:
      "Cascadia Code",
      Consolas,
      monospace;
    font-size: 0.67rem;
    overflow-wrap: anywhere;
  }

  .code-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .unsaved {
    color: var(--warning);
    font-size: 0.68rem;
    font-weight: 850;
  }

  .external-warning,
  .error-panel,
  .loading-panel,
  .advanced-test-note {
    margin-bottom: 14px;
    padding: 11px 12px;
    border-radius: 10px;
    font-size: 0.72rem;
  }

  .external-warning,
  .advanced-test-note {
    display: flex;
    align-items: flex-start;
    gap: 9px;
  }

  .external-warning {
    border: 1px solid
      color-mix(
        in srgb,
        var(--warning) 28%,
        var(--border)
      );
    color: var(--warning);
    background: color-mix(
      in srgb,
      var(--warning) 8%,
      var(--surface)
    );
  }

  .external-warning span,
  .advanced-test-note span {
    color: var(--muted);
  }

  .advanced-test-note {
    border: 1px solid
      color-mix(
        in srgb,
        var(--accent) 24%,
        var(--border)
      );
    color: var(--accent);
    background: color-mix(
      in srgb,
      var(--accent) 6%,
      var(--surface)
    );
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

  .loading-panel {
    border: 1px solid var(--border);
    color: var(--muted);
    background: var(--surface-2);
  }

  .missing-source,
  .empty-editor {
    display: grid;
    min-height: 360px;
    place-items: center;
    align-content: center;
    gap: 9px;
    padding: 34px;
    border: 1px dashed
      color-mix(
        in srgb,
        var(--muted) 28%,
        transparent
      );
    border-radius: 13px;
    text-align: center;
    background: color-mix(
      in srgb,
      var(--surface-solid) 33%,
      transparent
    );
  }

  .missing-source h2,
  .empty-editor h2 {
    margin: 0;
    font-size: 1rem;
  }

  .missing-source p,
  .empty-editor p {
    max-width: 600px;
    margin: 0;
    color: var(--muted);
    font-size: 0.74rem;
    line-height: 1.5;
  }

  .missing-source code {
    max-width: 100%;
    margin: 4px 0 8px;
    overflow-wrap: anywhere;
    color: var(--muted);
    font-size: 0.7rem;
  }

  .missing-icon {
    display: grid;
    width: 46px;
    height: 46px;
    place-items: center;
    border-radius: 14px;
    color: var(--accent);
    background: var(--accent-soft);
    font-size: 1.35rem;
  }

  .editor-footer {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    margin-top: 8px;
    color: var(--muted);
    font-size: 0.65rem;
  }

  .form-grid {
    display: grid;
    gap: 14px;
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

  label em {
    color: var(--danger);
    font-style: normal;
  }

  label > small {
    margin-bottom: 7px;
    color: var(--muted);
    font-size: 0.67rem;
  }

  input[type='text'],
  input[type='number'],
  textarea {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 10px;
    outline: none;
    color: var(--text);
    background: color-mix(
      in srgb,
      var(--surface-solid) 67%,
      transparent
    );
  }

  input[type='text'],
  input[type='number'] {
    min-height: 42px;
    padding: 0 12px;
  }

  textarea {
    padding: 11px 12px;
    resize: vertical;
  }

  input:focus,
  textarea:focus {
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

  input[type='checkbox'] {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
  }

  .raw-arguments {
    min-height: 260px;
    font-family:
      "Cascadia Code",
      "SFMono-Regular",
      Consolas,
      monospace;
    font-size: 0.74rem;
    line-height: 1.55;
  }

  .run-row {
    display: flex;
    justify-content: flex-end;
    margin-top: 17px;
  }

  .result {
    margin-top: 18px;
    padding-top: 18px;
    border-top: 1px solid var(--border);
  }

  .result header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 14px;
  }

  .result header > div {
    display: flex;
    gap: 12px;
    color: var(--muted);
    font-size: 0.69rem;
  }

  .result header a {
    color: var(--accent);
    font-weight: 850;
  }

  .result-block {
    margin-top: 12px;
  }

  .result-label {
    margin-bottom: 6px;
    color: var(--muted);
    font-size: 0.63rem;
    font-weight: 900;
    letter-spacing: 0.1em;
  }

  @media (max-width: 720px) {
    .heading-status,
    .code-heading,
    .result header,
    .result header > div,
    .advanced-schema-summary > div {
      align-items: flex-start;
      flex-direction: column;
    }

    dl div {
      grid-template-columns: 1fr;
      gap: 4px;
    }

    .tool-tabs {
      width: 100%;
    }

    .tool-tabs button {
      flex: 1;
    }
  }
</style>
