<script lang="ts">
  import { beforeNavigate, invalidateAll } from '$app/navigation';
  import MonacoEditor from '$lib/components/MonacoEditor.svelte';
  let { data } = $props();
  let project = $derived(data.nativeProject);
  let manifestPath = $state('');
  let busy = $state(false);
  let error = $state('');
  let source = $state<{ path: string; content: string; revision: string } | null>(null);
  let draft = $state('');
  let kind = $state<'tool' | 'resource' | 'prompt'>('tool');
  let selected = $state('');
  let argumentsText = $state('{}');
  let result = $state('');
  let dirty = $derived(source !== null && draft !== source.content);
  let capabilities = $derived(
    project
      ? kind === 'tool'
        ? project.catalog.tools
        : kind === 'resource'
          ? project.catalog.resources
          : project.catalog.prompts
      : []
  );

  beforeNavigate((navigation) => {
    if (dirty && !window.confirm('Discard unsaved native source changes?')) navigation.cancel();
  });

  async function request(body: object) {
    const response = await fetch('/api/mcpack', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Request failed.');
    return payload;
  }

  async function perform(operation: () => Promise<void>) {
    busy = true;
    error = '';
    try {
      await operation();
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    } finally {
      busy = false;
      await invalidateAll();
    }
  }

  function open() {
    return perform(async () => {
      await request({ action: 'open', manifestPath });
      source = null;
      result = '';
      selected = '';
    });
  }

  function read(path: string) {
    return perform(async () => {
      const payload = await request({ action: 'read', project: project!.manifestPath, path });
      source = payload.source;
      draft = source!.content;
    });
  }

  function save() {
    if (busy || !source || !project) return;
    return perform(async () => {
      const payload = await request({
        action: 'save',
        project: project!.manifestPath,
        path: source!.path,
        content: draft,
        revision: source!.revision
      });
      source = payload.source;
      draft = source!.content;
      result = '';
    });
  }

  function invoke() {
    return perform(async () => {
      const args = JSON.parse(argumentsText);
      if (!args || typeof args !== 'object' || Array.isArray(args))
        throw new Error('Arguments must be a JSON object.');
      const payload = await request({
        action: 'invoke',
        project: project!.manifestPath,
        kind,
        name: selected,
        arguments: args
      });
      result = JSON.stringify(payload.result, null, 2);
    });
  }
</script>

<svelte:head><title>Native MCPack · Modern MCP Forge</title></svelte:head>
<section class="native-workbench">
  <header>
    <p class="eyebrow">NATIVE PROJECTS · PREVIEW</p>
    <h1>MCPack workbench</h1>
    <p>Develop the same manifest and handler files you run independently with MCPack.</p>
  </header>

  <form
    onsubmit={(event) => {
      event.preventDefault();
      void open();
    }}
  >
    <label for="manifest">Path to mcpack.json</label>
    <div class="row">
      <input
        id="manifest"
        bind:value={manifestPath}
        placeholder="C:/repos/my-tools/mcpack.json"
        required
        disabled={busy || dirty}
      />
      <button disabled={busy || dirty || !manifestPath.trim()}>Open project</button>
    </div>
    <small>Open trusted local code. Opening starts its handlers and selects it for /mcp.</small>
  </form>

  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if project}
    <section class="panel">
      <div class="row">
        <div class="grow">
          <h2>{project.name}</h2>
          <p>{project.status} · generation {project.generation}</p>
          <code>{project.manifestPath}</code>
        </div>
        <button
          disabled={busy || dirty}
          onclick={() =>
            perform(async () => {
              await request({ action: 'restart', project: project!.manifestPath });
              result = '';
            })}>Restart</button
        >
        <button
          disabled={busy || dirty}
          onclick={() =>
            perform(async () => {
              await request({ action: 'close' });
              source = null;
              result = '';
            })}>Close</button
        >
      </div>
      {#if project.error}<p class="error" role="alert">{project.error}</p>{/if}
      <p>Agent endpoint: <code>/mcp</code>. Reconnect your agent after saving or restarting.</p>
      <small
        >Native selection lasts for this Forge process. TypeScript projects must compile their
        handlers before restarting.</small
      >
    </section>

    <section class="panel">
      <h2>Project files</h2>
      <div class="files">
        {#each project.files as path}<button disabled={busy || dirty} onclick={() => read(path)}
            >{path.split(/[\\/]/).pop()}</button
          >{/each}
      </div>
      {#if source}
        <p><code>{source.path}</code>{dirty ? ' · Unsaved changes' : ''}</p>
        <MonacoEditor
          value={draft}
          language={source.path.endsWith('.json') ? 'json' : 'javascript'}
          readOnly={busy}
          onChange={(value) => {
            draft = value;
          }}
          onSave={save}
        />
        <div class="row controls">
          <button disabled={busy || !dirty} onclick={save}>Save and restart</button>
          <button
            disabled={busy || !dirty}
            onclick={() => {
              draft = source!.content;
            }}>Discard changes</button
          >
          <button disabled={busy || dirty} onclick={() => read(source!.path)}
            >Reload from disk</button
          >
        </div>
      {:else}<p>Select the manifest or a worker module to edit it in Monaco.</p>{/if}
    </section>

    <section class="panel">
      <h2>Discover and test</h2>
      <div class="row">
        <label
          >Capability
          <select
            bind:value={kind}
            onchange={() => {
              selected = '';
              result = '';
            }}
            disabled={busy}
          >
            <option value="tool">Tools</option><option value="resource">Resources</option><option
              value="prompt">Prompts</option
            >
          </select>
        </label>
        <label class="grow"
          >Name
          <select bind:value={selected} disabled={busy}>
            <option value="">Select a capability</option>
            {#each capabilities as capability}
              <option value={'uri' in capability ? String(capability.uri) : capability.name}
                >{capability.name}</option
              >
            {/each}
          </select>
        </label>
      </div>
      {#if selected}
        <details>
          <summary>Source definition</summary>
          <pre>{JSON.stringify(
              capabilities.find((item) => ('uri' in item ? item.uri : item.name) === selected),
              null,
              2
            )}</pre>
        </details>
      {/if}
      {#if kind !== 'resource'}<label for="native-arguments">Arguments (JSON)</label><textarea
          id="native-arguments"
          rows="6"
          bind:value={argumentsText}
          disabled={busy}
        ></textarea>{/if}
      <button disabled={busy || project.status !== 'ready' || !selected} onclick={invoke}
        >{busy ? 'Working…' : 'Run'}</button
      >
      {#if result}<pre aria-live="polite">{result}</pre>{/if}
    </section>

    <section class="panel">
      <div class="row">
        <h2 class="grow">Worker diagnostics</h2>
        <button disabled={busy} onclick={() => invalidateAll()}>Refresh</button>
      </div>
      <pre>{project.diagnostics || 'No worker output yet.'}</pre>
      <small>Shows recent stderr and handler logs. Logs may contain application secrets.</small>
    </section>
  {:else}
    <p>
      MCPack is included with Forge. Open an existing native manifest, or copy the example from
      <code>node_modules/@modern-software/mcpack/examples/hello</code> into your own project folder.
    </p>
  {/if}
</section>

<style>
  .native-workbench {
    display: grid;
    gap: 22px;
  }
  h1,
  h2,
  p {
    margin: 0 0 10px;
  }
  h2 {
    font-size: 1rem;
  }
  .eyebrow,
  small {
    color: var(--muted);
  }
  .eyebrow {
    font-size: 0.7rem;
    letter-spacing: 0.12em;
  }
  .panel,
  form {
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    min-width: 0;
  }
  .row,
  .files {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .grow,
  input {
    flex: 1;
    min-width: 0;
  }
  label {
    display: block;
    margin-bottom: 8px;
  }
  input,
  select,
  textarea,
  button {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px;
    color: var(--text);
    background: var(--surface-solid);
  }
  select,
  textarea {
    display: block;
    width: 100%;
    margin: 8px 0;
  }
  textarea,
  pre,
  code {
    font-family: 'Cascadia Code', monospace;
  }
  button {
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: 360px;
    overflow: auto;
    font-size: 0.8rem;
  }
  code {
    overflow-wrap: anywhere;
    font-size: 0.8rem;
  }
  .error {
    color: var(--danger, #cf4848);
  }
  .controls {
    margin-top: 12px;
  }
</style>
