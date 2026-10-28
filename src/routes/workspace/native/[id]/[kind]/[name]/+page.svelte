<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    registerProjectLeaveGuard,
    canLeaveProject
  } from '$lib/navigation/project-leave';
  import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
  import MonacoEditor from '$lib/components/MonacoEditor.svelte';
  import {
    schemaFields,
    fieldsSchema,
    type SchemaField
  } from '$lib/authoring/schema-fields';
  let { data } = $props();
  let tab = $state<'definition' | 'code' | 'test'>('definition');
  let mode = $state<'fields' | 'json'>('fields');
  let content = $state('');
  let original = $state('');
  let revision = $state('');
  let fields = $state<SchemaField[]>([]);
  let originalFields = $state('[]');
  let key = $state('');
  let busy = $state(false);
  let error = $state('');
  let notice = $state('');
  let code = $state('');
  let originalCode = $state('');
  let codeRevision = $state('');
  let codePath = $state('');
  let argumentsText = $state('{}');
  let result = $state('');
  let definition = $derived.by(() => {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  });
  let fieldsDirty = $derived(
    mode === 'fields' && JSON.stringify(fields) !== originalFields
  );
  let definitionDirty = $derived(content !== original || fieldsDirty);
  let codeDirty = $derived(code !== originalCode);
  let dirty = $derived(definitionDirty || codeDirty);
  let source = $derived(
    data.snapshot.sources.find((item) => item.id === data.sourceId)
  );
  let disabled = $derived(source?.status !== 'ready' || data.disabled);

  function resetDefinition() {
    content = original = JSON.stringify(data.definition, null, 2);
    revision = data.revision;
    const loaded =
      data.kind === 'tools' ? schemaFields(data.definition.inputSchema) : [];
    fields = loaded ?? [];
    originalFields = JSON.stringify(fields);
    mode = loaded === null ? 'json' : 'fields';
  }
  $effect(() => {
    const next = `${data.projectId}/${data.sourceId}/${data.kind}/${data.definition.name}`;
    if (next !== key) {
      key = next;
      resetDefinition();
      code = originalCode = data.handlerFile?.content ?? '';
      codeRevision = data.handlerFile?.revision ?? '';
      codePath = data.handlerFile?.path ?? '';
      tab = 'definition';
      error = '';
      notice = '';
      result = '';
      argumentsText = '{}';
    }
  });
  onMount(() =>
    registerProjectLeaveGuard(
      () =>
        !busy &&
        (!dirty ||
          window.confirm('Discard unsaved definition or code changes?'))
    )
  );
  beforeNavigate((navigation) => {
    if (!canLeaveProject()) navigation.cancel();
  });

  function draftDefinition() {
    const value = JSON.parse(content);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Definition must be a JSON object.');
    if (mode === 'fields' && data.kind === 'tools')
      value.inputSchema = fieldsSchema(fields, value.inputSchema);
    return value;
  }
  function changeMode(next: 'fields' | 'json') {
    if (next === mode) return;
    error = '';
    try {
      if (next === 'json') content = JSON.stringify(draftDefinition(), null, 2);
      else {
        const value = JSON.parse(content);
        const loaded =
          data.kind === 'tools' ? schemaFields(value.inputSchema) : [];
        if (loaded === null)
          throw new Error(
            'This schema uses nested fields or advanced rules. Keep editing in JSON mode; no rules have been removed.'
          );
        fields = loaded;
        originalFields = JSON.stringify(fields);
      }
      mode = next;
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    }
  }
  function setProperty(name: string, value: unknown) {
    if (definition)
      content = JSON.stringify({ ...definition, [name]: value }, null, 2);
  }
  async function request(body: object) {
    const response = await fetch('/api/project/native', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: data.projectId,
        id: data.sourceId,
        generation: data.snapshot.generation,
        ...body
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? 'Request failed.');
    return payload;
  }
  async function refresh() {
    await invalidateAll();
    await tick();
  }
  async function saveDefinition() {
    if (busy || !definitionDirty) return;
    busy = true;
    error = '';
    notice = '';
    let destination = '';
    try {
      const value = draftDefinition();
      if (
        codeDirty &&
        (value.name !== data.definition.name ||
          value.worker !== data.definition.worker)
      )
        throw new Error(
          'Save or discard your code draft before renaming or changing workers.'
        );
      const payload = await request({
        action: 'update-definition',
        kind: data.kind,
        originalName: data.definition.name,
        definition: value,
        revision
      });
      content = original = JSON.stringify(value, null, 2);
      originalFields = JSON.stringify(fields);
      revision = payload.file.revision;
      result = '';
      notice =
        'Definition saved. Project sources restarted; reconnect external MCP clients.';
      if (value.name !== data.definition.name)
        destination = `/workspace/native/${encodeURIComponent(data.sourceId)}/${data.kind}/${encodeURIComponent(value.name)}`;
      else {
        await refresh();
        if (!codeDirty) {
          code = originalCode = data.handlerFile?.content ?? '';
          codeRevision = data.handlerFile?.revision ?? '';
          codePath = data.handlerFile?.path ?? '';
        }
      }
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
      await refresh();
    } finally {
      busy = false;
    }
    if (destination) await goto(destination, { invalidateAll: true });
  }
  async function saveCode() {
    if (busy || !codeDirty) return;
    busy = true;
    error = '';
    notice = '';
    try {
      const payload = await request({
        action: 'save',
        path: codePath,
        content: code,
        revision: codeRevision
      });
      code = originalCode = payload.file.content;
      codeRevision = payload.file.revision;
      result = '';
      notice =
        'Code saved. Project sources restarted; reconnect external MCP clients.';
      await refresh();
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
      await refresh();
    } finally {
      busy = false;
    }
  }
  async function reload() {
    if (
      busy ||
      (dirty &&
        !window.confirm(
          'Discard unsaved definition and code changes and reload?'
        ))
    )
      return;
    busy = true;
    error = '';
    try {
      await refresh();
      resetDefinition();
      code = originalCode = data.handlerFile?.content ?? '';
      codeRevision = data.handlerFile?.revision ?? '';
      codePath = data.handlerFile?.path ?? '';
      result = '';
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    } finally {
      busy = false;
    }
  }
  async function run() {
    if (busy || dirty || disabled) return;
    busy = true;
    error = '';
    result = '';
    try {
      const args = data.kind === 'resources' ? {} : JSON.parse(argumentsText);
      if (!args || typeof args !== 'object' || Array.isArray(args))
        throw new Error('Arguments must be a JSON object.');
      const payload = await request({
        action: 'invoke',
        kind:
          data.kind === 'tools'
            ? 'tool'
            : data.kind === 'resources'
              ? 'resource'
              : 'prompt',
        name:
          data.kind === 'resources'
            ? data.definition.uri
            : data.definition.name,
        arguments: args
      });
      result = JSON.stringify(payload.result, null, 2);
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    } finally {
      busy = false;
      await refresh();
    }
  }
</script>

<svelte:head
  ><title>{String(data.definition.name)} · Modern MCP Forge</title></svelte:head
>
<svelte:window
  onbeforeunload={(event) => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  }}
/>
<a href="/workspace">← Workspace</a>
<section class="page-heading">
  <div>
    <div class="eyebrow">NATIVE · {data.kind}</div>
    <h1>{String(data.definition.name)}</h1>
    <p>
      Source: {data.sourceId} · Worker: {String(data.definition.worker)} · Handler:
      {String(data.definition.handler)}
    </p>
  </div>
  <a
    class="secondary-button"
    href={`/project/native/${encodeURIComponent(data.sourceId)}`}
    >Advanced source files</a
  >
</section>
<nav class="editor-tabs" aria-label="Capability editor">
  <button
    class:chosen={tab === 'definition'}
    aria-current={tab === 'definition' ? 'page' : undefined}
    onclick={() => (tab = 'definition')}
    >Definition{definitionDirty ? ' *' : ''}</button
  >
  <button
    class:chosen={tab === 'code'}
    aria-current={tab === 'code' ? 'page' : undefined}
    onclick={() => (tab = 'code')}>Code{codeDirty ? ' *' : ''}</button
  >
  <button
    class:chosen={tab === 'test'}
    aria-current={tab === 'test' ? 'page' : undefined}
    onclick={() => (tab = 'test')}>Test</button
  >
</nav>
{#if error || data.snapshot.error}<p role="alert" class="workflow-error">
    {error || data.snapshot.error}
  </p>{/if}
{#if notice}<p role="status">{notice}</p>{/if}
<section class="glass-card editor-panel">
  {#if tab === 'definition'}
    <div class="workflow-toolbar">
      <h2>Definition</h2>
      <label
        >Editor mode<select
          value={mode}
          disabled={busy}
          onchange={(event) =>
            changeMode(event.currentTarget.value as 'fields' | 'json')}
          ><option value="fields">Visual fields</option><option value="json"
            >JSON definition</option
          ></select
        ></label
      >
    </div>
    {#if mode === 'json'}
      <p class="workflow-muted">
        Edit the full definition, including nested input schemas and worker
        bindings. Advanced schemas stay in JSON mode without losing validation
        rules.
      </p>
      <MonacoEditor
        value={content}
        language="json"
        readOnly={busy}
        onChange={(value) => (content = value)}
        onSave={saveDefinition}
      />
    {:else if definition}
      <div class="workflow-form">
        <label
          >Name<input
            value={String(definition.name ?? '')}
            disabled={busy}
            oninput={(event) => setProperty('name', event.currentTarget.value)}
          /></label
        >
        <label
          >Description<textarea
            value={String(definition.description ?? '')}
            disabled={busy}
            oninput={(event) =>
              setProperty('description', event.currentTarget.value)}
          ></textarea></label
        >
        {#if data.kind === 'tools'}
          <h3>Input fields</h3>
          <p class="workflow-muted">
            Changes are included when you save the definition. Existing
            validation rules are retained unless you change a field's type. Use
            JSON mode for nested objects and arrays.
          </p>
          {#each fields as field, index}<div class="field-row">
              <label
                >Field name<input
                  bind:value={field.name}
                  disabled={busy}
                /></label
              >
              <label
                >Type<select bind:value={field.type} disabled={busy}
                  ><option>string</option><option>number</option><option
                    >integer</option
                  ><option>boolean</option></select
                ></label
              >
              <label
                >Description<input
                  bind:value={field.description}
                  disabled={busy}
                /></label
              >
              <label class="required"
                >Required<input
                  type="checkbox"
                  bind:checked={field.required}
                  disabled={busy}
                /></label
              >
              <button
                disabled={busy}
                onclick={() => (fields = fields.filter((_, i) => i !== index))}
                >Remove</button
              >
            </div>{/each}
          <button
            disabled={busy}
            onclick={() =>
              (fields = [
                ...fields,
                {
                  name: '',
                  type: 'string',
                  description: '',
                  required: false,
                  schema: {}
                }
              ])}>Add field</button
          >
        {:else if data.kind === 'resources'}
          <label
            >URI<input
              value={String(definition.uri ?? '')}
              disabled={busy}
              oninput={(event) => setProperty('uri', event.currentTarget.value)}
            /></label
          >
          <label
            >Content type<input
              value={String(definition.mimeType ?? '')}
              disabled={busy}
              oninput={(event) =>
                setProperty('mimeType', event.currentTarget.value)}
            /></label
          >
        {:else}
          <p>
            Prompt arguments are strings. Edit their definitions in JSON mode;
            implement the rendered messages in Code.
          </p>
        {/if}
      </div>
    {/if}
    <div class="workflow-toolbar save-bar">
      <button
        class="primary-button"
        disabled={busy || !definitionDirty}
        onclick={saveDefinition}>Save definition</button
      >
      <button disabled={busy || !definitionDirty} onclick={resetDefinition}
        >Discard definition changes</button
      >
      <button disabled={busy} onclick={reload}>Reload from disk</button>
      <span>{definitionDirty ? 'Unsaved definition' : 'Definition saved'}</span>
    </div>
  {:else if tab === 'code'}
    <h2>Code</h2>
    <p>
      Handler <code>{String(data.definition.handler)}</code> in
      <code>{codePath}</code>. This module may be shared by other items in the
      same worker.
    </p>
    {#if codePath}
      <MonacoEditor
        value={code}
        language={codePath.endsWith('.py')
          ? 'python'
          : codePath.endsWith('.ts')
            ? 'typescript'
            : 'javascript'}
        readOnly={busy}
        onChange={(value) => (code = value)}
        onSave={saveCode}
      />
      <div class="workflow-toolbar save-bar">
        <button
          class="primary-button"
          disabled={busy || !codeDirty}
          onclick={saveCode}>Save code</button
        ><button
          disabled={busy || !codeDirty}
          onclick={() => (code = originalCode)}>Discard code changes</button
        ><button disabled={busy} onclick={reload}>Reload from disk</button>
      </div>
    {:else}<p role="alert">
        {data.codeError || 'No worker module available.'} Use Advanced source files
        to repair the manifest.
      </p>{/if}
  {:else}
    <h2>Test {String(data.definition.name)}</h2>
    <p>
      Runs this item's saved implementation. No need to select its source, type
      or name again.
    </p>
    {#if dirty}<p role="status">
        Save or discard your definition and code changes before testing.
      </p>{/if}
    {#if disabled}<p role="status">
        This item or its source is disabled or unavailable. Enable or repair it
        before testing.
      </p>{/if}
    <details>
      <summary>Saved definition</summary>
      <pre>{JSON.stringify(data.definition, null, 2)}</pre>
    </details>
    {#if data.kind !== 'resources'}<label class="arguments"
        >Arguments (JSON)<textarea
          rows="8"
          bind:value={argumentsText}
          disabled={busy}></textarea></label
      >{/if}
    <button
      class="primary-button"
      disabled={busy || dirty || disabled}
      onclick={run}>{busy ? 'Running…' : 'Run'}</button
    >
    {#if result}<h3>Result</h3>
      <pre aria-live="polite">{result}</pre>{/if}
  {/if}
</section>

<style>
  .editor-tabs {
    display: flex;
    gap: 8px;
    margin: 20px 0;
  }
  .editor-tabs button {
    flex: 1;
    padding: 12px;
  }
  button.chosen {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .editor-panel {
    padding: 24px;
    min-width: 0;
  }
  .editor-panel .workflow-form {
    max-width: none;
    padding: 0;
  }
  .field-row {
    display: grid;
    grid-template-columns: minmax(100px, 1fr) 110px minmax(
        140px,
        1fr
      ) 75px auto;
    gap: 12px;
    align-items: end;
    margin: 14px 0;
  }
  .required input {
    width: 20px;
    min-height: 24px;
  }
  .save-bar {
    margin-top: 20px;
  }
  .arguments {
    display: grid;
    gap: 8px;
    margin: 16px 0;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    background: var(--surface-solid);
    color: var(--text);
    padding: 12px;
  }
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    max-height: 450px;
    overflow: auto;
  }
  code {
    overflow-wrap: anywhere;
  }
  @media (max-width: 800px) {
    .field-row {
      grid-template-columns: 1fr 1fr;
    }
    .editor-panel {
      padding: 16px;
    }
  }
</style>
