<script lang="ts">
  import MonacoEditor
    from '$lib/components/MonacoEditor.svelte';
  import InContextDefinitionEditor
    from '$lib/components/InContextDefinitionEditor.svelte';

  let { data } = $props();

  type Tab =
    | 'overview'
    | 'template'
    | 'preview';

  let tab =
    $state<Tab>('overview');

  let sourceLoading =
    $state(false);
  let sourceSaving =
    $state(false);
  let sourceCreating =
    $state(false);
  let sourceError =
    $state('');
  let sourceContent =
    $state('');
  let sourceOriginal =
    $state('');
  let sourceLoaded =
    $state(false);
  let sourceExists =
    $state(false);
  let sourcePromptKey =
    $state('');

  let previewValues =
    $state<Record<string, string>>({});

  let argumentEntries = $derived(
    Object.entries(
      data.prompt.arguments
    )
  );

  $effect(() => {
    previewValues =
      Object.fromEntries(
        argumentEntries.map(
          ([name]) => [
            name,
            ''
          ]
        )
      );
  });

  $effect(() => {
    const nextSourceKey = `${data.prompt.name}:${data.source.resolvedPath}`;

    if (
      sourcePromptKey !==
      nextSourceKey
    ) {
      sourcePromptKey =
        nextSourceKey;
      sourceExists =
        data.source.exists;
      sourceContent = '';
      sourceOriginal = '';
      sourceLoaded = false;
      sourceError = '';
      tab = 'overview';
    }
  });

  const sourceDirty = $derived(
    sourceLoaded &&
      sourceContent !==
        sourceOriginal
  );

  const renderedPreview = $derived(
    sourceLoaded
      ? sourceContent.replace(
          /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g,
          (match, name: string) =>
            previewValues[name] ||
            match
        )
      : ''
  );

  async function openTemplateTab() {
    tab = 'template';

    if (
      !sourceLoaded &&
      sourceExists
    ) {
      await loadSource();
    }
  }

  async function openPreviewTab() {
    tab = 'preview';

    if (
      !sourceLoaded &&
      sourceExists
    ) {
      await loadSource();
    }
  }

  async function loadSource() {
    sourceLoading = true;
    sourceError = '';

    try {
      const response =
        await fetch(
          `/api/project/prompts/${encodeURIComponent(data.prompt.name)}/source`
        );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ??
            `Template load failed with status ${response.status}.`
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

  async function createSource() {
    sourceCreating = true;
    sourceError = '';

    try {
      const response =
        await fetch(
          `/api/project/prompts/${encodeURIComponent(data.prompt.name)}/source`,
          {
            method: 'POST'
          }
        );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ??
            `Template creation failed with status ${response.status}.`
        );
      }

      sourceExists = true;
      sourceContent =
        payload.content;
      sourceOriginal =
        payload.content;
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
      const response =
        await fetch(
          `/api/project/prompts/${encodeURIComponent(data.prompt.name)}/source`,
          {
            method: 'PUT',
            headers: {
              'content-type':
                'application/json'
            },
            body: JSON.stringify({
              content:
                sourceContent
            })
          }
        );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ??
            `Template save failed with status ${response.status}.`
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

  function updatePreviewValue(
    name: string,
    event: Event
  ) {
    const input =
      event.currentTarget as HTMLInputElement;

    previewValues[name] =
      input.value;
  }
</script>

<svelte:head>
  <title>
    Modern MCP Forge · {data.prompt.name}
  </title>
</svelte:head>

<section class="page-heading">
  <div>
    <div class="eyebrow">
      MCP PROMPT
    </div>
    <h1>
      {data.prompt.title ??
        data.prompt.name}
    </h1>
    <p>
      {data.prompt.description ||
        'Reusable MCP prompt template.'}
    </p>
  </div>

  <div class="heading-status">
    <span class="role-badge">
      {data.prompt.role}
    </span>

    <span
      class:status-ready={
        sourceExists
      }
      class:status-failed={
        !sourceExists
      }
    >
      <span class="status-dot"></span>
      {sourceExists
        ? 'Template ready'
        : 'Missing template'}
    </span>
  </div>
</section>

<InContextDefinitionEditor
  kind="prompt"
  definition={data.prompt}
  returnPath="/prompts"
/>

<nav
  class="prompt-tabs glass-card"
  aria-label="Prompt sections"
>
  <button
    class:active={
      tab === 'overview'
    }
    type="button"
    onclick={() =>
      (tab = 'overview')}
  >
    Overview
  </button>

  <button
    class:active={
      tab === 'template'
    }
    type="button"
    onclick={openTemplateTab}
  >
    Template
    {#if sourceDirty}
      <span
        class="dirty-dot"
        title="Unsaved changes"
      ></span>
    {/if}
  </button>

  <button
    class:active={
      tab === 'preview'
    }
    type="button"
    onclick={openPreviewTab}
  >
    Preview
  </button>
</nav>

{#if tab === 'overview'}
  <section class="glass-card detail-card">
    <div class="section-heading">
      <div class="eyebrow">
        DEFINITION
      </div>
      <h2>
        Prompt configuration
      </h2>
    </div>

    <dl>
      <div>
        <dt>Name</dt>
        <dd>
          <code>
            {data.prompt.name}
          </code>
        </dd>
      </div>

      <div>
        <dt>Role</dt>
        <dd>
          {data.prompt.role}
        </dd>
      </div>

      <div>
        <dt>Template</dt>
        <dd>
          <code>
            {data.prompt.template}
          </code>
        </dd>
      </div>

      <div>
        <dt>Resolved path</dt>
        <dd>
          <code>
            {data.source.resolvedPath}
          </code>
        </dd>
      </div>
    </dl>

    <div class="arguments">
      <div class="eyebrow">
        ARGUMENTS
      </div>

      {#if argumentEntries.length === 0}
        <p class="empty">
          This prompt has no arguments.
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

            <p>
              {definition.description ||
                'No description.'}
            </p>
          </div>
        {/each}
      {/if}
    </div>

    {#if data.source.external}
      <div class="external-warning">
        <strong>
          External template
        </strong>
        <span>
          Editing this prompt modifies the original file outside the Forge project.
        </span>
      </div>
    {/if}
  </section>

{:else if tab === 'template'}
  <section class="glass-card template-card">
    <header class="template-heading">
      <div>
        <div class="eyebrow">
          TEMPLATE
        </div>
        <h2>
          {data.prompt.template}
        </h2>
        <p>
          {data.source.resolvedPath}
        </p>
      </div>

      <div class="template-actions">
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
            : 'Save template'}
        </button>
      </div>
    </header>

    {#if sourceError}
      <div class="error-panel">
        {sourceError}
      </div>
    {/if}

    {#if sourceLoading}
      <div class="loading-panel">
        Loading template…
      </div>
    {:else if !sourceExists}
      <div class="missing-source">
        <div class="missing-icon">
          ✦
        </div>
        <h2>
          Prompt template does not exist yet.
        </h2>
        <p>
          Forge can initialize an argument-aware Markdown starter at the declared path.
        </p>
        <code>
          {data.source.resolvedPath}
        </code>

        <button
          class="primary-button"
          type="button"
          disabled={sourceCreating}
          onclick={createSource}
        >
          {sourceCreating
            ? 'Creating…'
            : 'Create prompt template'}
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
        Load template
      </button>
    {/if}
  </section>

{:else}
  <section class="glass-card preview-card">
    <div class="section-heading">
      <div class="eyebrow">
        PROMPTS/GET
      </div>
      <h2>
        Render preview
      </h2>
      <p>
        Supply argument values to see the message Forge will return through MCP.
      </p>
    </div>

    {#if sourceError}
      <div class="error-panel">
        {sourceError}
      </div>
    {/if}

    {#if !sourceExists}
      <div class="missing-preview">
        Create the prompt template before previewing it.
      </div>
    {:else}
      {#if argumentEntries.length > 0}
        <div class="preview-arguments">
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

              <input
                value={previewValues[name] ?? ''}
                oninput={(event) =>
                  updatePreviewValue(
                    name,
                    event
                  )}
                placeholder={`Value for ${name}`}
              />
            </label>
          {/each}
        </div>
      {/if}

      <div class="message-preview">
        <header>
          <span>
            role
          </span>
          <strong>
            {data.prompt.role}
          </strong>
        </header>

        <pre>{renderedPreview}</pre>
      </div>
    {/if}
  </section>
{/if}

<style>
  .heading-status {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .role-badge {
    padding: 6px 9px;
    border-radius: 999px;
    color: var(--lavender);
    background: var(--lavender-soft);
    font-size: 0.62rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  .prompt-tabs {
    display: flex;
    width: max-content;
    max-width: 100%;
    gap: 5px;
    margin-bottom: 16px;
    padding: 5px;
  }

  .prompt-tabs button {
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

  .prompt-tabs button.active {
    color: var(--accent);
    background: var(--accent-soft);
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
  .template-card,
  .preview-card {
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

  .section-heading p {
    margin: 5px 0 0;
    color: var(--muted);
    font-size: 0.72rem;
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
    grid-template-columns:
      130px minmax(0, 1fr);
    gap: 14px;
    padding: 12px;
    background:
      color-mix(
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
    padding: 11px 0;
    border-bottom: 1px solid var(--border);
  }

  .argument-definition div {
    display: flex;
    gap: 7px;
    align-items: baseline;
  }

  .argument-definition strong {
    font-size: 0.76rem;
  }

  .argument-definition span {
    color: var(--accent);
    font-size: 0.61rem;
    font-weight: 850;
  }

  .argument-definition p,
  .empty {
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 0.69rem;
  }

  .template-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 17px;
    margin-bottom: 14px;
  }

  .template-heading h2 {
    margin: 0 0 4px;
    font-size: 1rem;
  }

  .template-heading p {
    margin: 0;
    color: var(--muted);
    font-family:
      "Cascadia Code",
      Consolas,
      monospace;
    font-size: 0.66rem;
  }

  .template-actions {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .unsaved {
    color: var(--warning);
    font-size: 0.67rem;
    font-weight: 850;
  }

  .external-warning,
  .error-panel,
  .loading-panel,
  .missing-preview {
    margin-top: 14px;
    padding: 11px 12px;
    border-radius: 10px;
    font-size: 0.71rem;
  }

  .external-warning {
    display: flex;
    gap: 9px;
    border: 1px solid
      color-mix(
        in srgb,
        var(--warning) 28%,
        var(--border)
      );
    color: var(--warning);
    background:
      color-mix(
        in srgb,
        var(--warning) 8%,
        var(--surface)
      );
  }

  .external-warning span {
    color: var(--muted);
  }

  .error-panel {
    color: var(--danger);
    background: var(--danger-soft);
  }

  .loading-panel,
  .missing-preview {
    color: var(--muted);
    background: var(--surface-2);
  }

  .missing-source {
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
  }

  .missing-source h2 {
    margin: 0;
    font-size: 1rem;
  }

  .missing-source p {
    max-width: 600px;
    margin: 0;
    color: var(--muted);
    font-size: 0.74rem;
  }

  .missing-source code {
    color: var(--muted);
    font-size: 0.68rem;
  }

  .missing-icon {
    display: grid;
    width: 46px;
    height: 46px;
    place-items: center;
    border-radius: 14px;
    color: var(--lavender);
    background: var(--lavender-soft);
  }

  .editor-footer {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
    color: var(--muted);
    font-size: 0.65rem;
  }

  .preview-arguments {
    display: grid;
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 17px;
  }

  label > span,
  label > small {
    display: block;
  }

  label > span {
    margin-bottom: 4px;
    font-size: 0.74rem;
    font-weight: 850;
  }

  label > small {
    min-height: 18px;
    margin-bottom: 6px;
    color: var(--muted);
    font-size: 0.64rem;
  }

  label em {
    color: var(--danger);
    font-style: normal;
  }

  label input {
    width: 100%;
    min-height: 42px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--text);
    background: var(--surface-solid);
  }

  .message-preview {
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 12px;
  }

  .message-preview header {
    display: flex;
    gap: 8px;
    padding: 9px 12px;
    border-bottom: 1px solid var(--border);
    color: var(--muted);
    font-size: 0.67rem;
  }

  .message-preview strong {
    color: var(--accent);
  }

  .message-preview pre {
    min-height: 250px;
    margin: 0;
    padding: 16px;
    overflow: auto;
    color: var(--text);
    background:
      color-mix(
        in srgb,
        var(--surface-solid) 58%,
        transparent
      );
    font-family:
      "Cascadia Code",
      Consolas,
      monospace;
    font-size: 0.72rem;
    line-height: 1.55;
    white-space: pre-wrap;
  }

  @media (
    max-width: 760px
  ) {
    .heading-status,
    .template-heading {
      align-items: flex-start;
      flex-direction: column;
    }

    .preview-arguments,
    dl div {
      grid-template-columns: 1fr;
    }

    .prompt-tabs {
      width: 100%;
    }

    .prompt-tabs button {
      flex: 1;
    }
  }
</style>
