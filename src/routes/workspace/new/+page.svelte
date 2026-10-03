<script lang="ts">
  import { goto } from '$app/navigation';
  let { data } = $props();
  let kind = $state('tools');
  let sourceId = $state('');
  let name = $state('');
  let description = $state('');
  let runtime = $state('node');
  let busy = $state(false);
  let error = $state('');
  async function create() {
    busy = true; error = '';
    try {
      const response = await fetch('/api/project/native', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create-capability', projectId: data.project.id, generation: data.snapshot.generation, id: sourceId, name, description, kind, runtime }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      await goto(`/workspace/native/${encodeURIComponent(sourceId)}/${kind}/${encodeURIComponent(name)}`, { invalidateAll: true });
    } catch (failure) { error = failure instanceof Error ? failure.message : String(failure); }
    finally { busy = false; }
  }
</script>
<svelte:head><title>Add capability · Modern MCP Forge</title></svelte:head>
<a href="/workspace">← Workspace</a>
<section class="page-heading"><div><h1>Add a capability</h1><p>Create an editable native implementation in your project folder.</p></div></section>
<form class="glass-card workflow-form" onsubmit={(event) => { event.preventDefault(); void create(); }}>
  {#if error}<p role="alert" class="workflow-error">{error}</p>{/if}
  <label>Implementation<select disabled={busy}><option>Native MCPack</option><option disabled>Bridge · Coming next</option></select></label>
  <label>Capability<select bind:value={kind} disabled={busy}><option value="tools">Tool</option><option value="resources">Resource</option><option value="prompts">Prompt</option></select></label>
  <label>Name<input bind:value={name} required pattern={"[A-Za-z][A-Za-z0-9_-]{0,63}"} disabled={busy} placeholder="lookup_order" /></label>
  <label>Description<textarea bind:value={description} maxlength="4096" disabled={busy}></textarea></label>
  <label>New source ID<input bind:value={sourceId} required pattern={"[A-Za-z][A-Za-z0-9_-]{0,63}"} disabled={busy} placeholder="orders" /></label>
  <label>Worker runtime<select bind:value={runtime} disabled={busy}><option value="node">Node</option><option value="python">Python</option></select></label>
  <p class="workflow-muted">Creates a source with one exposed capability and a dedicated worker. Configure its schema and edit its handler next. To reuse an existing worker, open its source files in Configuration and add a definition there.</p>
  <button class="primary-button" disabled={busy}>{busy ? 'Creating…' : 'Create capability'}</button>
</form>
