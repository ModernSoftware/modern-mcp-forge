<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    registerProjectLeaveGuard,
    canLeaveProject
  } from '$lib/navigation/project-leave';
  import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
  import MonacoEditor from '$lib/components/MonacoEditor.svelte';
  let { data } = $props();
  let content = $state('');
  let original = $state('');
  let key = $state('');
  let revision = $state('');
  let busy = $state(false);
  let error = $state('');
  $effect(() => {
    const next = `${data.projectId}/${data.sourceId}/${data.kind}/${data.definition.name}`;
    if (next !== key) {
      key = next;
      revision = data.revision;
      content = original = JSON.stringify(data.definition, null, 2);
    }
  });
  let dirty = $derived(content !== original);
  let definition = $derived.by(() => {
    try {
      return JSON.parse(content) as Record<string, any>;
    } catch {
      return null;
    }
  });
  let fields = $state<Array<{ name: string; type: string; required: boolean }>>(
    []
  );
  function setProperty(name: string, value: unknown) {
    if (definition)
      content = JSON.stringify({ ...definition, [name]: value }, null, 2);
  }
  function applyFields() {
    const properties: Record<string, unknown> = Object.create(null);
    for (const field of fields) {
      if (!field.name.trim() || Object.hasOwn(properties, field.name)) {
        error = 'Field names must be nonempty and unique.';
        return;
      }
      properties[field.name] = { type: field.type };
    }
    if (
      !window.confirm(
        'Replace the current input schema with these simple fields? Nested schemas and extra validation rules will be replaced.'
      )
    )
      return;
    setProperty('inputSchema', {
      type: 'object',
      properties,
      required: fields
        .filter((field) => field.required)
        .map((field) => field.name),
      additionalProperties: false
    });
    error = '';
  }
  onMount(() =>
    registerProjectLeaveGuard(
      () => !busy && (!dirty || window.confirm('Discard unsaved changes?'))
    )
  );
  beforeNavigate((navigation) => {
    if (!canLeaveProject()) navigation.cancel();
  });

  async function reload() {
    if (
      busy ||
      (dirty &&
        !window.confirm('Discard your draft and reload the definition?'))
    )
      return;
    busy = true;
    try {
      await invalidateAll();
      await tick();
      content = original = JSON.stringify(data.definition, null, 2);
      revision = data.revision;
      error = '';
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    } finally {
      busy = false;
    }
  }

  async function save() {
    if (busy || !dirty) return;
    busy = true;
    error = '';
    let destination = '';
    try {
      const definition = JSON.parse(content);
      const response = await fetch('/api/project/native', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'update-definition',
          projectId: data.projectId,
          id: data.sourceId,
          generation: data.snapshot.generation,
          kind: data.kind,
          originalName: data.definition.name,
          definition,
          revision
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      original = content;
      revision = payload.file.revision;
      destination = `/workspace/native/${encodeURIComponent(data.sourceId)}/${data.kind}/${encodeURIComponent(definition.name)}`;
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
      await invalidateAll();
    } finally {
      busy = false;
    }
    if (destination) await goto(destination, { invalidateAll: true });
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
    <p>Source: {data.sourceId} · Worker: {String(data.definition.worker)}</p>
  </div>
  <a
    class="secondary-button"
    href={`/project/native/${encodeURIComponent(data.sourceId)}`}
    >Edit code &amp; test</a
  >
</section>
{#if error || data.snapshot.error}<p role="alert" class="workflow-error">
    {error || data.snapshot.error}
  </p>{/if}
<section class="glass-card workflow-form">
  <h2>Definition</h2>
  <p>
    Edit the name, description, binding and {data.kind === 'tools'
      ? 'full JSON input schema'
      : data.kind === 'resources'
        ? 'URI and content type'
        : 'prompt arguments'}. Saving restarts project sources. Reconnect MCP
    clients afterward.
  </p>
  {#if definition}
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
    {#if data.kind === 'resources'}<label
        >URI<input
          value={String(definition.uri ?? '')}
          disabled={busy}
          oninput={(event) => setProperty('uri', event.currentTarget.value)}
        /></label
      ><label
        >Content type<input
          value={String(definition.mimeType ?? '')}
          disabled={busy}
          oninput={(event) =>
            setProperty('mimeType', event.currentTarget.value)}
        /></label
      >{/if}
    {#if data.kind === 'tools'}<details>
        <summary>Build input schema from simple fields</summary>
        <p class="workflow-muted">
          For nested objects, arrays and validation rules, use the full
          definition editor below. Applying fields replaces the schema draft.
        </p>
        {#each fields as field, index}<div class="workflow-toolbar">
            <label
              >Field name<input
                bind:value={field.name}
                disabled={busy}
              /></label
            ><label
              >Type<select bind:value={field.type} disabled={busy}
                ><option>string</option><option>number</option><option
                  >boolean</option
                ></select
              ></label
            ><label
              >Required<input
                type="checkbox"
                bind:checked={field.required}
                disabled={busy}
              /></label
            ><button
              disabled={busy}
              onclick={() => (fields = fields.filter((_, i) => i !== index))}
              >Remove</button
            >
          </div>{/each}
        <div class="workflow-toolbar">
          <button
            disabled={busy}
            onclick={() =>
              (fields = [
                ...fields,
                { name: '', type: 'string', required: false }
              ])}>Add field</button
          ><button disabled={busy} onclick={applyFields}
            >Apply fields to draft</button
          >
        </div>
      </details>{/if}
  {/if}
  <h3>Full definition and validation</h3>
  <MonacoEditor
    value={content}
    language="json"
    readOnly={busy}
    onChange={(value) => (content = value)}
    onSave={save}
  />
  <div class="workflow-toolbar">
    <button class="primary-button" disabled={busy || !dirty} onclick={save}
      >Save definition</button
    ><button
      class="secondary-button"
      disabled={busy || !dirty}
      onclick={() => (content = original)}>Discard changes</button
    ><button class="secondary-button" disabled={busy} onclick={reload}
      >Reload definition</button
    >
    <span>{busy ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'}</span>
  </div>
</section>
