<script lang="ts">
  import MonacoEditor
    from '$lib/components/MonacoEditor.svelte';
  import InContextDefinitionEditor
    from '$lib/components/InContextDefinitionEditor.svelte';

  let { data } = $props();

  type Tab =
    | 'overview'
    | 'content'
    | 'mcp';

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
  let sourceResourceKey =
    $state('');

  $effect(() => {
    const nextSourceKey = `${data.resource.name}:${data.source.resolvedPath}:${data.source.language}`;

    if (
      sourceResourceKey !==
      nextSourceKey
    ) {
      sourceResourceKey =
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

  async function openContentTab() {
    tab = 'content';

    if (
      !sourceLoaded &&
      sourceExists
    ) {
      await loadSource();
    }
  }

  async function openMcpTab() {
    tab = 'mcp';

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
          `/api/project/resources/${encodeURIComponent(data.resource.name)}/source`
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
        Boolean(
          payload.info.exists
        );

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
          `/api/project/resources/${encodeURIComponent(data.resource.name)}/source`,
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
          `/api/project/resources/${encodeURIComponent(data.resource.name)}/source`,
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

  const mcpListPreview = $derived({
    name:
      data.resource.name,
    title:
      data.resource.title,
    description:
      data.resource.description,
    uri:
      data.resource.uri,
    mimeType:
      data.resource.mimeType
  });

  const mcpReadPreview = $derived({
    contents: [
      {
        uri:
          data.resource.uri,
        mimeType:
          data.resource.mimeType,
        text:
          sourceLoaded
            ? sourceContent
            : sourceExists
              ? '<load Content to preview>'
              : '<source file missing>'
      }
    ]
  });
</script>

<svelte:head>
  <title>
    Modern MCP Forge · {data.resource.name}
  </title>
</svelte:head>

<section class="page-heading">
  <div>
    <div class="eyebrow">
      MCP RESOURCE
    </div>
    <h1>
      {data.resource.title ??
        data.resource.name}
    </h1>
    <p>
      {data.resource.description ||
        'File-backed MCP resource.'}
    </p>
  </div>

  <div class="heading-status">
    <span class="type-badge">
      {data.resource.mimeType}
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
        ? 'Source ready'
        : 'Missing source'}
    </span>
  </div>
</section>

<InContextDefinitionEditor
  kind="resource"
  definition={data.resource}
  returnPath="/resources"
/>

<nav
  class="resource-tabs glass-card"
  aria-label="Resource sections"
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
      tab === 'content'
    }
    type="button"
    onclick={openContentTab}
  >
    Content
    {#if sourceDirty}
      <span
        class="dirty-dot"
        title="Unsaved changes"
      ></span>
    {/if}
  </button>

  <button
    class:active={
      tab === 'mcp'
    }
    type="button"
    onclick={openMcpTab}
  >
    MCP Preview
  </button>
</nav>

{#if tab === 'overview'}
  <section class="glass-card detail-card">
    <div class="section-heading">
      <div class="eyebrow">
        DEFINITION
      </div>
      <h2>
        Resource configuration
      </h2>
    </div>

    <dl>
      <div>
        <dt>Name</dt>
        <dd>
          <code>
            {data.resource.name}
          </code>
        </dd>
      </div>

      <div>
        <dt>URI</dt>
        <dd>
          <code>
            {data.resource.uri}
          </code>
        </dd>
      </div>

      <div>
        <dt>MIME type</dt>
        <dd>
          {data.resource.mimeType}
        </dd>
      </div>

      <div>
        <dt>Source</dt>
        <dd>
          <code>
            {data.resource.source}
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

    {#if data.source.external}
      <div class="external-warning">
        <strong>
          External source
        </strong>
        <span>
          This resource points outside the Forge project directory. Editing Content modifies the original file.
        </span>
      </div>
    {/if}

    <div class="flow">
      <div>
        <strong>
          resources/list
        </strong>
        <span>
          advertises metadata and URI
        </span>
      </div>
      <span class="arrow">→</span>
      <div>
        <strong>
          resources/read
        </strong>
        <span>
          reads the current file content
        </span>
      </div>
    </div>
  </section>

{:else if tab === 'content'}
  <section class="glass-card content-card">
    <header class="content-heading">
      <div>
        <div class="eyebrow">
          CONTENT
        </div>
        <h2>
          {data.resource.source}
        </h2>
        <p>
          {data.source.resolvedPath}
        </p>
      </div>

      <div class="content-actions">
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
            : 'Save content'}
        </button>
      </div>
    </header>

    {#if data.source.external}
      <div class="external-warning">
        <strong>
          External source
        </strong>
        <span>
          Saving here modifies the original file outside the Forge project.
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
        Loading resource…
      </div>
    {:else if !sourceExists}
      <div class="missing-source">
        <div class="missing-icon">
          ○
        </div>
        <h2>
          Resource source does not exist yet.
        </h2>
        <p>
          Forge can initialize a starter {data.resource.mimeType} file at the declared source path.
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
            : 'Create resource source'}
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
        Load content
      </button>
    {/if}
  </section>

{:else}
  <section class="glass-card preview-card">
    <div class="section-heading">
      <div class="eyebrow">
        MCP PREVIEW
      </div>
      <h2>
        Protocol representation
      </h2>
      <p>
        This mirrors what an MCP client sees when listing and reading this resource.
      </p>
    </div>

    {#if sourceError}
      <div class="error-panel">
        {sourceError}
      </div>
    {/if}

    <div class="preview-grid">
      <div>
        <div class="preview-label">
          resources/list
        </div>
        <pre class="code-block">{JSON.stringify(mcpListPreview, null, 2)}</pre>
      </div>

      <div>
        <div class="preview-label">
          resources/read
        </div>
        <pre class="code-block">{JSON.stringify(mcpReadPreview, null, 2)}</pre>
      </div>
    </div>
  </section>
{/if}

<style>
  .heading-status {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .type-badge {
    padding: 6px 9px;
    border-radius: 999px;
    color: var(--lavender);
    background:
      var(--lavender-soft);
    font-size: 0.62rem;
    font-weight: 900;
  }

  .resource-tabs {
    display: flex;
    width: max-content;
    max-width: 100%;
    gap: 5px;
    margin-bottom: 16px;
    padding: 5px;
  }

  .resource-tabs button {
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

  .resource-tabs button.active {
    color: var(--accent);
    background:
      var(--accent-soft);
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
  .content-card,
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

  .flow {
    display: grid;
    grid-template-columns:
      1fr auto 1fr;
    gap: 12px;
    align-items: center;
    margin-top: 20px;
  }

  .flow > div {
    padding: 13px;
    border: 1px solid var(--border);
    border-radius: 11px;
    background:
      color-mix(
        in srgb,
        var(--surface-solid) 45%,
        transparent
      );
  }

  .flow strong,
  .flow span {
    display: block;
  }

  .flow strong {
    font-size: 0.74rem;
  }

  .flow span {
    margin-top: 3px;
    color: var(--muted);
    font-size: 0.65rem;
  }

  .flow .arrow {
    color: var(--accent);
    font-size: 1.1rem;
  }

  .content-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 17px;
    margin-bottom: 14px;
  }

  .content-heading h2 {
    margin: 0 0 4px;
    font-size: 1rem;
  }

  .content-heading p {
    margin: 0;
    color: var(--muted);
    font-family:
      "Cascadia Code",
      Consolas,
      monospace;
    font-size: 0.66rem;
    overflow-wrap: anywhere;
  }

  .content-actions {
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
  .loading-panel {
    margin: 14px 0;
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

  .loading-panel {
    border: 1px solid var(--border);
    color: var(--muted);
    background:
      var(--surface-2);
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
    background:
      color-mix(
        in srgb,
        var(--surface-solid) 33%,
        transparent
      );
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
    line-height: 1.5;
  }

  .missing-source code {
    max-width: 100%;
    margin: 4px 0 8px;
    overflow-wrap: anywhere;
    color: var(--muted);
    font-size: 0.68rem;
  }

  .missing-icon {
    display: grid;
    width: 46px;
    height: 46px;
    place-items: center;
    border-radius: 14px;
    color: var(--accent);
    background:
      var(--accent-soft);
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

  .preview-grid {
    display: grid;
    grid-template-columns:
      minmax(0, 0.85fr)
      minmax(0, 1.15fr);
    gap: 15px;
  }

  .preview-label {
    margin-bottom: 6px;
    color: var(--muted);
    font-size: 0.64rem;
    font-weight: 900;
    letter-spacing: 0.1em;
  }

  .preview-grid .code-block {
    min-height: 260px;
    margin: 0;
    overflow: auto;
  }

  @media (
    max-width: 820px
  ) {
    .heading-status,
    .content-heading {
      align-items: flex-start;
      flex-direction: column;
    }

    .preview-grid,
    .flow {
      grid-template-columns: 1fr;
    }

    .flow .arrow {
      transform: rotate(90deg);
      justify-self: center;
    }

    dl div {
      grid-template-columns: 1fr;
      gap: 4px;
    }

    .resource-tabs {
      width: 100%;
    }

    .resource-tabs button {
      flex: 1;
    }
  }
</style>
