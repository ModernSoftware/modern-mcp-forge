<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  let { data } = $props();
  let kind = $state(untrack(() => data.initialKind));
  let sourceId = $state('');
  let sourceChoice = $state('new');
  let workerChoice = $state('new');
  let workerId = $state('');
  let handler = $state('');
  let existing = $derived(
    data.sources.find((entry) => entry.source.id === sourceChoice)
  );
  let name = $state('');
  let description = $state('');
  let runtime = $state('node');
  let busy = $state(false);
  let error = $state('');
  async function create() {
    busy = true;
    error = '';
    try {
      const response = await fetch('/api/project/native', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create-capability',
          projectId: data.project.id,
          generation: data.snapshot.generation,
          id: sourceChoice === 'new' ? sourceId : sourceChoice,
          name,
          description,
          kind,
          runtime,
          options:
            sourceChoice === 'new'
              ? undefined
              : {
                  worker: workerChoice === 'new' ? workerId : workerChoice,
                  handler,
                  revision: existing?.revision,
                  newWorker: workerChoice === 'new'
                }
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      await goto(
        `/workspace/native/${encodeURIComponent(sourceChoice === 'new' ? sourceId : sourceChoice)}/${kind}/${encodeURIComponent(name)}`,
        { invalidateAll: true }
      );
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Add capability · Modern MCP Forge</title></svelte:head>
<a href="/workspace">← Workspace</a>
<section class="page-heading">
  <div>
    <h1>Add a capability</h1>
    <p>Create an editable native implementation in your project folder.</p>
  </div>
</section>
<form
  class="glass-card workflow-form"
  onsubmit={(event) => {
    event.preventDefault();
    void create();
  }}
>
  {#if error}<p role="alert" class="workflow-error">{error}</p>{/if}
  <label
    >Implementation<select aria-label="Implementation" disabled={busy}
      ><option>Native MCPack</option><option disabled
        >Bridge · Coming next</option
      ></select
    ></label
  >
  <label
    >Capability<select aria-label="Capability" bind:value={kind} disabled={busy}
      ><option value="tools">Tool</option><option value="resources"
        >Resource</option
      ><option value="prompts">Prompt</option></select
    ></label
  >
  <label
    >Name<input
      bind:value={name}
      required
      pattern={'[A-Za-z][A-Za-z0-9_-]{0,63}'}
      disabled={busy}
      placeholder="lookup_order"
    /></label
  >
  <label
    >Description<textarea
      bind:value={description}
      maxlength="4096"
      disabled={busy}
    ></textarea></label
  >
  <label
    >Source<select
      aria-label="Source"
      bind:value={sourceChoice}
      disabled={busy}
      onchange={() => (workerChoice = 'new')}
      ><option value="new">Create a source</option
      >{#each data.sources.filter((entry) => entry.source.kind === 'native' && entry.manifest) as entry}<option
          value={entry.source.id}>{entry.source.id}</option
        >{/each}</select
    ></label
  >
  {#if sourceChoice === 'new'}<label
      >New source ID<input
        bind:value={sourceId}
        required
        pattern={'[A-Za-z][A-Za-z0-9_-]{0,63}'}
        disabled={busy}
        placeholder="orders"
      /></label
    >{:else}
    <label
      >Worker<select
        aria-label="Worker"
        bind:value={workerChoice}
        disabled={busy}
        ><option value="new">Create a worker</option
        >{#each Object.entries(existing?.manifest?.workers ?? {}) as [id, worker]}<option
            value={id}>{id} · {worker.runtime}</option
          >{/each}</select
      ></label
    >
    {#if workerChoice === 'new'}<label
        >New worker ID<input
          bind:value={workerId}
          required
          pattern={'[A-Za-z][A-Za-z0-9_-]{0,63}'}
          disabled={busy}
        /></label
      >{:else}<label
        >Existing handler name<input
          bind:value={handler}
          required
          disabled={busy}
        /></label
      >
      <p class="workflow-muted">
        The existing factory must already return this handler. Forge will not
        rewrite your existing code.
      </p>{/if}
  {/if}
  {#if sourceChoice === 'new' || workerChoice === 'new'}<label
      >Worker runtime<select
        aria-label="Worker runtime"
        bind:value={runtime}
        disabled={busy}
        ><option value="node">Node</option><option value="python">Python</option
        ></select
      ></label
    >{/if}
  <p class="workflow-muted">
    Creates one exposed capability. New workers include editable example
    handlers. Configure the schema and implement your handler next; source
    startup errors remain visible and repairable.
  </p>
  <button class="primary-button" disabled={busy}
    >{busy ? 'Creating…' : 'Create capability'}</button
  >
</form>
