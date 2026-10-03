<script lang="ts">
  import { beforeNavigate, invalidateAll } from '$app/navigation';
  import MonacoEditor from '$lib/components/MonacoEditor.svelte';
  import NativeDefinitionEditor from '$lib/components/NativeDefinitionEditor.svelte';
  let { data } = $props();
  let busy = $state(false);
  let error = $state('');
  let file = $state<{ path: string; content: string; revision: string } | null>(
    null
  );
  let draft = $state('');
  let kind = $state<'tool' | 'resource' | 'prompt'>('tool');
  let selected = $state('');
  let argumentsText = $state('{}');
  let result = $state('');
  let dirty = $derived(file !== null && draft !== file.content);
  let source = $derived(
    data.snapshot.sources.find((item) => item.id === data.document.source.id)
  );
  let capabilities = $derived(
    source
      ? kind === 'tool'
        ? source.catalog.tools
        : kind === 'resource'
          ? source.catalog.resources
          : source.catalog.prompts
      : []
  );
  let selectionKey = $state('');
  $effect(() => {
    const next = `${data.projectId}/${data.document.source.id}`;
    if (selectionKey !== next) {
      selectionKey = next;
      file = null;
      draft = '';
      selected = '';
      result = '';
      error = '';
    }
  });
  beforeNavigate((navigation) => {
    if (busy || (dirty && !window.confirm('Discard unsaved native changes?')))
      navigation.cancel();
  });
  async function request(body: object) {
    const response = await fetch('/api/project/native', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: data.projectId,
        id: data.document.source.id,
        ...body
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Request failed.');
    return payload;
  }
  async function perform(operation: () => Promise<void>) {
    if (busy) return;
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
  function read(path: string) {
    return perform(async () => {
      const payload = await request({ action: 'read', path });
      file = payload.file;
      draft = file!.content;
    });
  }
  function save() {
    if (!file || !dirty) return;
    return perform(async () => {
      const payload = await request({
        action: 'save',
        generation: data.snapshot.generation,
        path: file!.path,
        content: draft,
        revision: file!.revision
      });
      file = payload.file;
      draft = file!.content;
      result = '';
      selected = '';
    });
  }
  function invoke() {
    return perform(async () => {
      const args = kind === 'resource' ? {} : JSON.parse(argumentsText);
      if (!args || typeof args !== 'object' || Array.isArray(args))
        throw new Error('Arguments must be a JSON object.');
      const payload = await request({
        action: 'invoke',
        generation: data.snapshot.generation,
        kind,
        name: selected,
        arguments: args
      });
      result = JSON.stringify(payload.result, null, 2);
    });
  }
</script>

<svelte:head
  ><title>{data.document.source.id} · Native authoring · Modern MCP Forge</title
  ></svelte:head
>
<svelte:window
  onbeforeunload={(event) => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  }}
/>
<div class="workbench">
  <header>
    <a href="/project">← Project sources</a>
    <div class="eyebrow">NATIVE MCPACK</div>
    <h1>{data.document.source.id}</h1>
    <p>
      {source?.status ?? 'stopped'} ·
      <code>{data.document.source.manifest}</code>
    </p>
    <p>
      Save your manifest or handler to restart project sources. Reconnect MCP
      clients after changes.
    </p>
  </header>
  {#if error || data.document.error || data.snapshot.error}<p
      role="alert"
      class="error"
    >
      {error || data.document.error || data.snapshot.error}
    </p>{/if}
  <section class="glass-card panel">
    <h2>Manifest and handlers</h2>
    <div class="row">
      {#each data.document.files as path}<button
          class:chosen={file?.path === path}
          disabled={busy || dirty}
          onclick={() => read(path)}>{path}</button
        >{/each}
    </div>
    {#if file}
      <p><code>{file.path}</code>{dirty ? ' · Unsaved changes' : ''}</p>
      {#if file.path === data.document.files[0]}<NativeDefinitionEditor
          content={draft}
          disabled={busy}
          onChange={(value) => (draft = value)}
        />{/if}
      <MonacoEditor
        value={draft}
        language={file.path.endsWith('.json')
          ? 'json'
          : file.path.endsWith('.py')
            ? 'python'
            : file.path.endsWith('.ts')
              ? 'typescript'
              : 'javascript'}
        readOnly={busy}
        onChange={(value) => (draft = value)}
        onSave={save}
      />
      <div class="row controls">
        <button disabled={busy || !dirty} onclick={save}
          >Save and restart sources</button
        >
        <button
          disabled={busy || !dirty}
          onclick={() => (draft = file!.content)}>Discard changes</button
        >
        <button disabled={busy || dirty} onclick={() => read(file!.path)}
          >Reload file</button
        >
      </div>
    {:else}<p>
        Select a manifest or worker module. Definitions and handler files remain editable even when a source cannot start.
      </p>{/if}
    <p class="note">
      Compile TypeScript before reloading. Configure extra workers in the
      manifest; their module files must already exist under its folder.
    </p>
  </section>
  <section class="glass-card panel">
    <h2>Test native capabilities</h2>
    <div class="row">
      <label
        >Kind<select
          bind:value={kind}
          disabled={busy}
          onchange={() => {
            selected = '';
            result = '';
          }}
          ><option value="tool">Tool</option><option value="resource"
            >Resource</option
          ><option value="prompt">Prompt</option></select
        ></label
      >
      <label class="grow"
        >Capability<select
          bind:value={selected}
          disabled={busy}
          onchange={() => (result = '')}
          ><option value="">Select a capability</option
          >{#each capabilities as capability}<option
              value={'uri' in capability
                ? String(capability.uri)
                : capability.name}>{capability.name}</option
            >{/each}</select
        ></label
      >
    </div>
    {#if selected}<details>
        <summary>Discovered definition</summary>
        <pre>{JSON.stringify(
            capabilities.find(
              (item) => ('uri' in item ? item.uri : item.name) === selected
            ),
            null,
            2
          )}</pre>
      </details>{/if}
    {#if kind !== 'resource'}<label
        >Arguments (JSON)<textarea
          rows="6"
          bind:value={argumentsText}
          disabled={busy}
        ></textarea></label
      >{/if}
    <button
      disabled={busy || dirty || source?.status !== 'ready' || !selected}
      onclick={invoke}>{busy ? 'Working…' : 'Run'}</button
    >
    {#if result}<pre aria-live="polite">{result}</pre>{/if}
    <p class="note">
      Nested tool arguments are validated by MCPack. Prompt values must be
      strings. Tests execute real handlers; calls are never automatically
      replayed.
    </p>
  </section>
</div>

<style>
  .workbench {
    display: grid;
    gap: 20px;
  }
  .panel {
    padding: 22px;
    min-width: 0;
  }
  h1,
  h2 {
    margin: 8px 0;
  }
  h2 {
    font-size: 1.1rem;
  }
  p {
    color: var(--muted);
    line-height: 1.5;
  }
  .eyebrow {
    margin-top: 16px;
  }
  a {
    color: var(--accent);
  }
  .row {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .grow {
    flex: 1;
  }
  label {
    display: grid;
    gap: 8px;
  }
  select,
  textarea,
  button {
    padding: 10px;
    background: var(--surface-solid);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    margin-bottom: 12px;
    font-family: monospace;
  }
  button {
    cursor: pointer;
    overflow-wrap: anywhere;
  }
  button:disabled {
    opacity: 0.5;
  }
  .chosen {
    border-color: var(--accent);
  }
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: 400px;
    overflow: auto;
    font-size: 0.8rem;
  }
  code {
    overflow-wrap: anywhere;
  }
  .controls {
    margin-top: 12px;
  }
  .note {
    font-size: 0.75rem;
  }
  .error {
    color: var(--danger, #c44);
  }
</style>
