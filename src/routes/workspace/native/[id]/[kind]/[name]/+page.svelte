<script lang="ts">
  import {
    promptFields,
    promptDefinitions,
    promptArgumentsSchema,
    type PromptArgument
  } from '$lib/authoring/prompt-arguments';
  import { page } from '$app/state';
  import JsonModeSwitch from '$lib/components/JsonModeSwitch.svelte';
  import NamedCases from '$lib/components/NamedCases.svelte';
  import McpResult from '$lib/components/McpResult.svelte';
  import ToolArguments from '$lib/components/ToolArguments.svelte';
  import { reloadProjectSources } from '$lib/client/reload-project-sources';
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
  const tabs = ['Definition', 'Code', 'Test'] as const;
  type EditorTab = (typeof tabs)[number];
  let tab = $state<EditorTab>('Definition');
  function navigateTabs(event: KeyboardEvent, index: number) {
    const offset =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!offset && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + offset + tabs.length) % tabs.length;
    tab = tabs[next];
    document.getElementById(`cap-tab-${tab}`)?.focus();
  }
  let mode = $state<'fields' | 'json'>('fields');
  let content = $state('');
  let original = $state('');
  let schemaText = $state('');
  let visualAvailability = $derived.by(() => {
    if (mode !== 'json') return '';
    if (data.kind === 'prompts') {
      try {
        return promptFields(JSON.parse(content).arguments) === null
          ? 'Fix the prompt argument definitions in JSON before switching to visual fields.'
          : '';
      } catch {
        return 'Finish the JSON syntax before switching to visual fields.';
      }
    }
    if (data.kind !== 'tools') return '';
    try {
      return schemaFields(JSON.parse(schemaText)) === null
        ? 'This schema uses nested fields or advanced rules. Edit it in JSON.'
        : '';
    } catch {
      return 'Finish the JSON syntax before switching to visual fields.';
    }
  });
  let revision = $state('');
  let fields = $state<SchemaField[]>([]);
  let originalFields = $state('[]');
  let promptArguments = $state<PromptArgument[]>([]);
  let originalPromptArguments = $state('[]');
  let promptDirty = $derived(
    mode === 'fields' &&
      JSON.stringify(promptArguments) !== originalPromptArguments
  );
  let key = $state('');
  let busy = $state(false);
  let reloading = $state(false);
  let conflict = $state(false);
  let copyNotice = $state('');
  let error = $state('');
  let notice = $state('');
  let code = $state('');
  let originalCode = $state('');
  let codeRevision = $state('');
  let codePath = $state('');
  let argumentsText = $state('{}');
  let editor = $state<ReturnType<typeof ToolArguments>>();
  let diagnostics = $state<string | null>(null);
  let diagnosticGeneration = $state(-1);
  async function showDiagnostics() {
    if (busy) return;
    const generation = data.snapshot.generation;
    busy = true;
    try {
      const payload = await request({ action: 'diagnostics' });
      diagnostics = payload.diagnostics;
      diagnosticGeneration = generation;
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    } finally {
      busy = false;
    }
  }
  let result = $state.raw<unknown>(undefined);
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
  let definitionDirty = $derived(
    content !== original ||
      fieldsDirty ||
      promptDirty ||
      (data.kind === 'tools' &&
        mode === 'json' &&
        schemaText !== JSON.stringify(definition?.inputSchema, null, 2))
  );
  let codeDirty = $derived(code !== originalCode);
  let dirty = $derived(definitionDirty || codeDirty);
  let source = $derived(
    data.snapshot.sources.find((item) => item.id === data.sourceId)
  );
  let disabled = $derived(source?.status !== 'ready' || data.disabled);

  function resetDefinition() {
    content = original = JSON.stringify(data.definition, null, 2);
    revision = data.revision;
    schemaText = JSON.stringify(data.definition.inputSchema ?? {}, null, 2);
    const loaded =
      data.kind === 'tools' ? schemaFields(data.definition.inputSchema) : [];
    fields = loaded ?? [];
    originalFields = JSON.stringify(fields);
    const prompts =
      data.kind === 'prompts' ? promptFields(data.definition.arguments) : [];
    promptArguments = prompts ?? [];
    originalPromptArguments = JSON.stringify(promptArguments);
    mode = loaded === null || prompts === null ? 'json' : 'fields';
  }
  $effect(() => {
    const next = `${data.projectId}/${data.sourceId}/${data.kind}/${data.definition.name}`;
    if (next !== key) {
      key = next;
      resetDefinition();
      code = originalCode = data.handlerFile?.content ?? '';
      codeRevision = data.handlerFile?.revision ?? '';
      codePath = data.handlerFile?.path ?? '';
      tab =
        page.url.searchParams.get('tab') === 'test' ? 'Test' : 'Definition';
      diagnostics = null;
      conflict = false;
      copyNotice = '';
      error = '';
      notice = '';
      result = undefined;
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
    if (data.kind === 'tools') {
      if (mode === 'json') value.inputSchema = JSON.parse(schemaText);
      else if (fieldsDirty)
        value.inputSchema = fieldsSchema(fields, value.inputSchema);
    }
    if (data.kind === 'prompts' && mode === 'fields' && promptDirty)
      value.arguments = promptDefinitions(promptArguments);
    return value;
  }
  function changeMode(json: boolean) {
    const next = json ? 'json' : 'fields';
    if (next === mode) return;
    error = '';
    try {
      const value = draftDefinition();
      if (data.kind === 'tools') {
        if (next === 'json')
          schemaText = JSON.stringify(value.inputSchema, null, 2);
        else {
          const loaded = schemaFields(value.inputSchema);
          if (!loaded) throw new Error(visualAvailability);
          fields = loaded;
          originalFields = JSON.stringify(fields);
        }
      }
      if (data.kind === 'prompts' && next === 'fields') {
        const loaded = promptFields(value.arguments);
        if (!loaded) throw new Error(visualAvailability);
        promptArguments = loaded;
        originalPromptArguments = JSON.stringify(loaded);
      }
      content = JSON.stringify(value, null, 2);
      mode = next;
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
      return false;
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
    if (!response.ok) {
      if (
        response.status === 409 &&
        /File changed on disk/.test(payload.error ?? '')
      )
        conflict = true;
      throw new Error(payload.error ?? 'Request failed.');
    }
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
      if (data.kind === 'tools' && mode === 'fields')
        fields = schemaFields(value.inputSchema) ?? [];
      originalFields = JSON.stringify(fields);
      promptArguments = promptFields(value.arguments) ?? [];
      originalPromptArguments = JSON.stringify(promptArguments);
      conflict = false;
      schemaText = JSON.stringify(value.inputSchema ?? {}, null, 2);
      revision = payload.file.revision;
      result = undefined;
      notice = payload.snapshot.error
        ? 'Definition saved. Source startup failed. Inspect diagnostics to repair the worker.'
        : 'Definition saved. Project sources restarted; reconnect external MCP clients.';
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
      conflict = false;
      result = undefined;
      notice = payload.snapshot.error
        ? 'Code saved. Source startup failed. Inspect diagnostics to repair the worker.'
        : 'Code saved. Project sources restarted; reconnect external MCP clients.';
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
    reloading = true;
    error = '';
    notice = '';
    result = undefined;
    try {
      const snapshot = await reloadProjectSources(
        data.projectId,
        data.snapshot.generation
      );
      await refresh();
      resetDefinition();
      conflict = false;
      copyNotice = '';
      code = originalCode = data.handlerFile?.content ?? '';
      codeRevision = data.handlerFile?.revision ?? '';
      codePath = data.handlerFile?.path ?? '';
      if (snapshot.error) throw new Error(snapshot.error);
      notice =
        'Files reloaded and project sources restarted. Reconnect any external MCP clients.';
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
      await refresh();
    } finally {
      busy = false;
      reloading = false;
    }
  }
  async function run() {
    if (busy || dirty || disabled) return;
    busy = true;
    error = '';
    notice = '';
    result = undefined;
    try {
      const args =
        data.kind !== 'resources'
          ? editor?.argumentsForRun()
          : data.kind === 'resources'
            ? {}
            : JSON.parse(argumentsText);
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
      result = payload.result;
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    } finally {
      busy = false;
      await refresh();
    }
  }
</script>

<svelte:head
  ><title>{String(data.definition.name)} · Modern MCP Forge</title
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
<div class="editor-tabs" role="tablist" aria-label="Capability editor">
  {#each tabs as item, index}
    <button
      role="tab"
      id={`cap-tab-${item}`}
      aria-controls="cap-panel"
      aria-selected={item === tab}
      tabindex={item === tab ? 0 : -1}
      onclick={() => (tab = item)}
      onkeydown={(event) => navigateTabs(event, index)}
    >
      {item}{(item === 'Definition' && definitionDirty) ||
      (item === 'Code' && codeDirty)
        ? ' *'
        : ''}
    </button>
  {/each}
</div>
<div class="runtime-bar" aria-busy={reloading}>
  <span>Source <strong>{source?.status ?? 'stopped'}</strong></span>
  <button class="secondary-button" disabled={busy} onclick={reload}
    >{reloading
      ? 'Reloading files & restarting sources…'
      : 'Reload files & restart sources'}</button
  >
  <button class="secondary-button" disabled={busy} onclick={showDiagnostics}
    >Show worker diagnostics</button
  >
  <small
    >Use reload after editing the worker or its imports outside Forge.</small
  >
</div>
{#if reloading}<p role="status">
    Reading files from disk and restarting project sources. This can take a
    moment while workers and connected servers start.
  </p>{/if}
{#if conflict}
  <section class="conflict-note" aria-label="File conflict">
    <p>
      The file changed outside Forge. Your draft is still in this editor. Copy
      it before reloading if you want to merge your changes in your IDE.
    </p>
    <button
      class="secondary-button"
      disabled={busy}
      onclick={async () => {
        try {
          await navigator.clipboard.writeText(
            tab === 'Code' ? code : JSON.stringify(draftDefinition(), null, 2)
          );
          copyNotice = 'Draft copied.';
        } catch {
          copyNotice =
            'Copy could not complete. Select and copy the draft from the editor.';
        }
      }}>Copy current draft</button
    >
    <button class="secondary-button" disabled={busy} onclick={reload}
      >Reload disk version</button
    >
    {#if copyNotice}<p role="status">{copyNotice}</p>{/if}
  </section>
{/if}
{#if diagnostics !== null && diagnosticGeneration === data.snapshot.generation}
  <pre class="code-block" aria-live="polite">{diagnostics ||
      'No worker output for this source.'}</pre>
{/if}
{#if error || data.snapshot.error}<p role="alert" class="workflow-error">
    {error || data.snapshot.error}
  </p>{/if}
{#if source?.status === 'failed'}
  <p class="workflow-muted">
    Check worker <code>{String(data.definition.worker)}</code> in
    <code>{codePath || data.sourceFolder}</code>. Its factory must return a
    <code>{data.kind}</code>
    entry named <code>{String(data.definition.handler)}</code>.
  </p>
{/if}
{#if notice}<p role="status">{notice}</p>{/if}
<div
  class="glass-card editor-panel"
  role="tabpanel"
  id="cap-panel"
  aria-labelledby={`cap-tab-${tab}`}
>
  {#if tab === 'Definition'}
    <h2>Definition</h2>
    {#if definition && (data.kind === 'tools' || mode === 'fields')}
      <div class="workflow-form">
        <label
          >Name<input
            value={String(definition.name ?? '')}
            disabled={busy}
            oninput={(event) =>
              setProperty('name', event.currentTarget.value)}
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
      </div>
    {/if}
    <div class="mode-toolbar">
      <span
        >{mode === 'fields'
          ? 'Visual fields'
          : data.kind === 'tools'
            ? 'JSON schema'
            : 'JSON definition'}</span
      >
      <JsonModeSwitch
        checked={mode === 'json'}
        disabled={busy || Boolean(visualAvailability)}
        onchange={changeMode}
      />
    </div>
    {#if mode === 'json'}
      <p class="workflow-muted">
        {visualAvailability ||
          (data.kind === 'tools'
            ? 'Edit the input schema for this tool.'
            : 'Edit the complete capability definition.')}
      </p>
      <MonacoEditor
        value={data.kind === 'tools' ? schemaText : content}
        language="json"
        readOnly={busy}
        onChange={(value) => {
          if (data.kind === 'tools') schemaText = value;
          else content = value;
        }}
        onSave={saveDefinition}
      />
    {:else if definition}
      <div class="workflow-form">
        {#if data.kind === 'tools'}
          <h3>Input fields</h3>
          <p class="workflow-muted">
            Changes are included when you save the definition. Existing
            validation rules are retained unless you change a field's type.
            Use JSON mode for nested objects and arrays.
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
                >
              </label>
              <label
                >Description<input
                  bind:value={field.description}
                  disabled={busy}
                /></label
              >
              {#if field.type === 'string'}
                <label class="minimum-length"
                  >Minimum length
                  <input
                    name={'minLength-' + index}
                    type="number"
                    min="0"
                    step="1"
                    disabled={busy}
                    value={field.schema.type === 'string' &&
                    typeof field.schema.minLength === 'number'
                      ? field.schema.minLength
                      : undefined}
                    oninput={(event) => {
                      const input = event.currentTarget;
                      const schema: Record<string, unknown> =
                        field.schema.type === 'string'
                          ? { ...field.schema }
                          : { type: 'string' };
                      if (input.value === '' && !input.validity.badInput)
                        delete schema.minLength;
                      else schema.minLength = input.valueAsNumber;
                      field.schema = schema;
                    }}
                  />
                </label>
              {:else}<span class="constraint-empty" aria-hidden="true"
                ></span>{/if}
              <label class="required"
                >Required<input
                  type="checkbox"
                  bind:checked={field.required}
                  disabled={busy}
                /></label
              >
              <button
                class="secondary-button"
                disabled={busy}
                onclick={() =>
                  (fields = fields.filter((_, i) => i !== index))}
                >Remove</button
              >
              {#if field.schema.type === field.type && Array.isArray(field.schema.enum)}
                <small class="workflow-muted allowed-values"
                  >Allowed values · {field.schema.enum
                    .map((choice) => JSON.stringify(choice))
                    .join(', ')}</small
                >
              {/if}
            </div>{/each}
          <button
            class="secondary-button"
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
              oninput={(event) =>
                setProperty('uri', event.currentTarget.value)}
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
          <h3>Prompt arguments</h3>
          <p class="workflow-muted">
            Declare the string values used by your handler. Implement the
            rendered messages in Code.
          </p>
          {#each promptArguments as argument, index}
            <div class="field-row prompt-row">
              <label
                >Argument name<input
                  bind:value={argument.name}
                  disabled={busy}
                /></label
              >
              <label
                >Description<input
                  bind:value={argument.description}
                  disabled={busy}
                /></label
              >
              <label class="required"
                >Required<input
                  type="checkbox"
                  bind:checked={argument.required}
                  disabled={busy}
                /></label
              >
              <button
                class="secondary-button"
                disabled={busy}
                onclick={() =>
                  (promptArguments = promptArguments.filter(
                    (_, i) => i !== index
                  ))}>Remove argument</button
              >
            </div>
          {/each}
          <button
            class="secondary-button"
            disabled={busy}
            onclick={() =>
              (promptArguments = [
                ...promptArguments,
                { name: '', description: '', required: false }
              ])}>Add argument</button
          >
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
      <span
        >{definitionDirty ? 'Unsaved definition' : 'Definition saved'}</span
      >
    </div>
  {:else if tab === 'Code'}
    <h2>Code</h2>
    <p>
      Handler <code>{String(data.definition.handler)}</code> in
      <code>{codePath}</code>. This module may be shared by other items in the
      same worker.
    </p>
    {#if data.runtime === 'node'}
      <details class="dependencies">
        <summary>Node dependencies</summary>
        <p>
          Manage this worker's packages in <code>{data.sourceFolder}</code>.
          Reload the project sources after changing installed dependencies.
        </p>
      </details>
    {/if}
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
        >
      </div>
    {:else}<p role="alert">
        {data.codeError || 'No worker module available.'} Use Advanced source files
        to repair the manifest.
      </p>{/if}
  {:else}
    <h2>Test {String(data.definition.name)}</h2>
    <p>
      Runs this item's saved implementation. No need to select its source,
      type or name again.
    </p>
    {#if dirty}<p role="status">
        Save or discard your definition and code changes before testing.
      </p>{/if}
    {#if disabled}<p role="status">
        {#if !data.sourceEnabled}
          This source is disabled. <a href="/project">Open Configuration</a> to
          enable it.
        {:else if data.disabled}
          This capability is disabled. <a href="/workspace"
            >Open the workspace</a
          > to enable it.
        {:else if data.snapshot.status === 'failed' || source?.status === 'failed'}
          Startup failed. Inspect worker diagnostics, repair the files, then
          reload the sources.
        {:else}
          The project is open and its workers are stopped. Use Reload files
          &amp; restart sources above to start testing.
        {/if}
      </p>{/if}
    <details>
      <summary>Saved definition</summary>
      <pre>{JSON.stringify(data.definition, null, 2)}</pre>
    </details>
    {#if data.kind === 'tools'}
      <ToolArguments
        bind:this={editor}
        schema={source?.catalog.tools.find(
          (tool) => tool.name === data.definition.name
        )?.inputSchema ?? data.definition.inputSchema}
        bind:text={argumentsText}
        disabled={busy}
      />
    {:else if data.kind === 'prompts'}
      <ToolArguments
        bind:this={editor}
        kind="prompt"
        schema={promptArgumentsSchema(data.definition.arguments)}
        bind:text={argumentsText}
        disabled={busy}
      />
    {/if}
    <button
      class="primary-button"
      disabled={busy ||
        dirty ||
        disabled ||
        (data.kind !== 'resources' && !editor?.canRun())}
      onclick={run}>{busy ? 'Running…' : 'Run'}</button
    >
    {#if result !== undefined}{#key result}<McpResult {result} />{/key}{/if}
    {#if data.kind === 'tools'}{#key JSON.stringify( [data.projectId, data.sourceId, data.definition.name] )}
        <NamedCases
          projectId={data.projectId}
          generation={data.snapshot.generation}
          source={data.sourceId}
          sourceKind="native"
          tool={String(data.definition.name)}
          {argumentsText}
          {result}
          disabled={busy || dirty || disabled}
        />
      {/key}{/if}
  {/if}
</div>

<style>
  .mode-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin: 1rem 0;
  }
  .editor-tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
    margin: 20px 0 12px;
  }
  .editor-tabs button {
    flex: 1;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 8px 8px 0 0;
    background: transparent;
    font: inherit;
    font-weight: 650;
    color: var(--text);
    cursor: pointer;
  }
  .editor-tabs button[aria-selected='true'] {
    border-color: var(--accent);
    background: var(--accent-soft);
    box-shadow: inset 0 -3px var(--accent);
  }
  .runtime-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }
  .runtime-bar small {
    color: var(--muted);
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
    grid-template-columns:
      minmax(100px, 1fr) 100px minmax(140px, 1.4fr)
      105px 75px auto;
    gap: 12px;
    align-items: end;
    margin: 14px 0;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .minimum-length {
    max-width: 10rem;
  }
  .field-row .required {
    align-self: stretch;
    align-content: space-between;
    padding-bottom: 8px;
  }
  .prompt-row {
    grid-template-columns: minmax(120px, 1fr) minmax(160px, 2fr) 75px auto;
  }
  .conflict-note {
    padding: 1rem;
    margin: 1rem 0;
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .conflict-note button {
    margin: 0.25rem 0.5rem 0.25rem 0;
  }
  .allowed-values {
    grid-column: 1 / -1;
    overflow-wrap: anywhere;
  }
  .field-row label {
    display: grid;
    gap: 6px;
    min-width: 0;
    font-size: 0.85rem;
  }
  .field-row input,
  .field-row select {
    width: 100%;
    min-width: 0;
  }
  .field-row .required input {
    appearance: none;
    width: 2.65rem;
    height: 1.5rem;
    min-height: 0;
    padding: 2px;
    border-radius: 1rem;
    background: var(--surface-3);
    border: 1px solid var(--muted);
    cursor: pointer;
  }
  .required input::before {
    content: '';
    display: block;
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 50%;
    background: var(--muted);
  }
  .required input:checked {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
  .required input:checked::before {
    background: var(--text);
    transform: translateX(1.1rem);
  }
  .editor-tabs button:focus-visible,
  .required input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  @media (max-width: 520px) {
    .editor-panel .field-row {
      grid-template-columns: 1fr;
    }
    .field-row {
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
    }
  }
  .save-bar {
    align-items: center;
    margin-top: 20px;
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
  @media (max-width: 1100px) {
    .field-row {
      grid-template-columns: 1fr 1fr;
    }
    .constraint-empty {
      display: none;
    }
    .editor-panel {
      padding: 16px;
    }
  }
</style>
