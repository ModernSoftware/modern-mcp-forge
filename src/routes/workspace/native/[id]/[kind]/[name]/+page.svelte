<script lang="ts">
  import { beforeNavigate, goto } from '$app/navigation';
  import MonacoEditor from '$lib/components/MonacoEditor.svelte';
  let { data } = $props();
  let content = $state('');
  let original = $state('');
  let key = $state('');
  let busy = $state(false);
  let error = $state('');
  $effect(() => {
    const next = `${data.projectId}/${data.sourceId}/${data.kind}/${data.definition.name}/${data.revision}`;
    if (next !== key) { key = next; content = original = JSON.stringify(data.definition, null, 2); }
  });
  let dirty = $derived(content !== original);
  beforeNavigate((navigation) => { if (busy || (dirty && !window.confirm('Discard unsaved definition changes?'))) navigation.cancel(); });
  async function save() {
    busy = true; error = '';
    let destination = '';
    try {
      const definition = JSON.parse(content);
      const response = await fetch('/api/project/native', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'update-definition', projectId: data.projectId, id: data.sourceId, generation: data.snapshot.generation, kind: data.kind, originalName: data.definition.name, definition, revision: data.revision }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      original = content;
      destination = `/workspace/native/${encodeURIComponent(data.sourceId)}/${data.kind}/${encodeURIComponent(definition.name)}`;
    } catch (failure) { error = failure instanceof Error ? failure.message : String(failure); }
    finally { busy = false; }
    if (destination) await goto(destination, { invalidateAll: true });
  }
</script>
<svelte:head><title>{String(data.definition.name)} · Modern MCP Forge</title></svelte:head>
<svelte:window onbeforeunload={(event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }} />
<a href="/workspace">← Workspace</a>
<section class="page-heading"><div><div class="eyebrow">NATIVE · {data.kind}</div><h1>{String(data.definition.name)}</h1><p>Source: {data.sourceId} · Worker: {String(data.definition.worker)}</p></div><a class="secondary-button" href={`/project/native/${encodeURIComponent(data.sourceId)}`}>Edit code &amp; test</a></section>
{#if error || data.snapshot.error}<p role="alert" class="workflow-error">{error || data.snapshot.error}</p>{/if}
<section class="glass-card workflow-form">
  <h2>Definition</h2><p>Edit the name, description, binding and {data.kind === 'tools' ? 'full JSON input schema' : data.kind === 'resources' ? 'URI and content type' : 'prompt arguments'}. Saving restarts project sources. Reconnect MCP clients afterward.</p>
  <MonacoEditor value={content} language="json" readOnly={busy} onChange={(value) => content = value} onSave={save} />
  <div class="workflow-toolbar"><button class="primary-button" disabled={busy || !dirty} onclick={save}>Save definition</button><button class="secondary-button" disabled={busy || !dirty} onclick={() => content = original}>Discard changes</button><span>{dirty ? 'Unsaved changes' : 'Saved'}</span></div>
</section>
