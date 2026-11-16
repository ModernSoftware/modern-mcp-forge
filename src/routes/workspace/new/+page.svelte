<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import MonacoEditor from '$lib/components/MonacoEditor.svelte';
  let { data } = $props();
  let kind = $state(untrack(() => data.initialKind));
  let name = $state('');
  let sourceId = $state('');
  let customSourceId = $state(false);
  let effectiveSourceId = $derived(customSourceId ? sourceId : name);
  let label = $derived(
    kind === 'tools' ? 'tool' : kind === 'resources' ? 'resource' : 'prompt'
  );
  let sourceChoice = $state('new');
  let workerChoice = $state('new');
  let workerId = $state('');
  let customWorkerId = $state(false);
  let effectiveWorkerId = $derived(customWorkerId ? workerId : name);
  let implementation = $state('add');
  let handler = $state('');
  let existing = $derived(
    data.sources.find((entry) => entry.source.id === sourceChoice)
  );
  let description = $state('');
  let runtime = $state('node');
  let busy = $state(false);
  let error = $state('');
  let preview = $state<{
    key: string;
    path: string;
    original: string;
    content: string;
    revision: string;
    runtime: string;
  } | null>(null);
  let previewKey = $derived(
    JSON.stringify([
      sourceChoice,
      workerChoice,
      implementation,
      kind,
      name,
      description,
      existing?.revision
    ])
  );
  let currentPreview = $derived(preview?.key === previewKey ? preview : null);
  let addingToWorker = $derived(
    sourceChoice !== 'new' && implementation === 'add'
  );
  let selectedWorker = $derived(existing?.manifest?.workers[workerChoice]);
  async function create() {
    busy = true;
    error = '';
    try {
      if (addingToWorker && !currentPreview) {
        const response = await fetch('/api/project/native', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'preview-handler',
            projectId: data.project.id,
            generation: data.snapshot.generation,
            id: sourceChoice,
            kind,
            name,
            worker: workerChoice,
            revision: existing?.revision
          })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        preview = { ...payload.preview, key: previewKey };
        return;
      }
      const response = await fetch('/api/project/native', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create-capability',
          projectId: data.project.id,
          generation: data.snapshot.generation,
          id: sourceChoice === 'new' ? effectiveSourceId : sourceChoice,
          name,
          description,
          kind,
          runtime,
          options:
            sourceChoice === 'new'
              ? undefined
              : {
                  worker:
                    implementation === 'create'
                      ? effectiveWorkerId
                      : workerChoice,
                  handler,
                  revision: existing?.revision,
                  newWorker: implementation === 'create',
                  addHandler: implementation === 'add',
                  workerRevision: currentPreview?.revision
                }
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      await goto(
        `/workspace/native/${encodeURIComponent(sourceChoice === 'new' ? effectiveSourceId : sourceChoice)}/${kind}/${encodeURIComponent(name)}`,
        { invalidateAll: true }
      );
    } catch (failure) {
      preview = null;
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
    <div class="eyebrow">NATIVE MCPACK</div>
    <h1>Add a {label}</h1>
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
    >Type<select aria-label="Capability" bind:value={kind} disabled={busy}
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
      disabled={busy}></textarea></label
  >
  <label
    >Native source<select
      aria-label="Source"
      bind:value={sourceChoice}
      disabled={busy}
      onchange={(event) => {
        const source = data.sources.find(
          (entry) => entry.source.id === event.currentTarget.value
        );
        workerChoice = Object.keys(source?.manifest?.workers ?? {})[0] ?? '';
        implementation = workerChoice ? 'add' : 'create';
      }}
      ><option value="new">Create a source</option
      >{#each data.sources.filter((entry) => entry.source.kind === 'native' && entry.manifest) as entry}<option
          value={entry.source.id}>{entry.source.id}</option
        >{/each}</select
    ></label
  >
  <p class="workflow-muted">
    A native source is an exportable MCPack pack. It can contain several
    workers, and each worker can share its module and initialized dependencies
    across tools, resources and prompts.
  </p>
  {#if sourceChoice === 'new'}<label
      >Source ID<input
        value={effectiveSourceId}
        oninput={(event) => {
          customSourceId = true;
          sourceId = event.currentTarget.value;
        }}
        required
        pattern={'[A-Za-z][A-Za-z0-9_-]{0,63}'}
        disabled={busy}
        placeholder="orders"
      /></label
    >
    <p class="workflow-muted">
      Creates <code
        >native/{effectiveSourceId || 'source-id'}/mcpack.json</code
      > and a worker module. The source ID identifies this group; it is not the
      handler filename.
    </p>{:else}
    <label
      >Implementation<select
        aria-label="Implementation"
        bind:value={implementation}
        disabled={busy}
      >
        <option value="add">Add a new handler to an existing worker</option>
        <option value="create">Create a new worker and handler</option>
        <option value="existing">Use an existing handler</option>
      </select></label
    >
    {#if implementation === 'create'}
      <label
        >New worker ID<input
          value={effectiveWorkerId}
          oninput={(event) => {
            customWorkerId = true;
            workerId = event.currentTarget.value;
          }}
          required
          pattern={'[A-Za-z][A-Za-z0-9_-]{0,63}'}
          disabled={busy}
        /></label
      >
      <p class="workflow-muted">
        Creates an editable handler in its own worker module within this
        source. Give each worker a distinct ID. You can import shared services
        from your application.
      </p>
    {:else}
      <label
        >Worker<select
          aria-label="Worker"
          bind:value={workerChoice}
          required
          disabled={busy}
        >
          <option value="">Select an existing worker</option>
          {#each Object.entries(existing?.manifest?.workers ?? {}) as [id, worker]}
            <option value={id}
              >{id} · {worker.runtime} · {worker.module}</option
            >
          {/each}
        </select></label
      >
      {#if implementation === 'existing'}<label
          >Existing handler name<input
            bind:value={handler}
            required
            disabled={busy}
          /></label
        >
        <p class="workflow-muted">
          The selected worker's factory must already return this handler under <code
            >{kind}</code
          >. This option adds a manifest binding without changing the worker
          code.
        </p>
      {:else}
        <p class="workflow-muted">
          Adds <code>{name || 'handler-name'}</code> under <code>{kind}</code>
          in
          <code>{selectedWorker?.module || 'the selected module'}</code>. The
          worker's {selectedWorker?.runtime || ''} runtime and settings stay in
          use. You can review the code change before creating the {label}.
        </p>
      {/if}
    {/if}
  {/if}
  {#if sourceChoice === 'new' || implementation === 'create'}<label
      >Worker runtime<select
        aria-label="Worker runtime"
        bind:value={runtime}
        disabled={busy}
        ><option value="node">Node</option><option value="python"
          >Python</option
        ></select
      ></label
    >{/if}
  <p class="workflow-muted">
    Configure the definition and implement the generated handler in the
    editor. Saving creation restarts project sources; shared worker state is
    reinitialized.
  </p>
  {#if addingToWorker && currentPreview}
    <section aria-label="Worker change preview" class="handler-preview">
      <h2>Worker change preview</h2>
      <p>
        Add <code>{kind}.{name}</code> to <code>{currentPreview.path}</code> and
        register its definition in this source. No new worker file is created.
      </p>
      <details>
        <summary>Current file</summary>
        <pre>{currentPreview.original}</pre>
      </details>
      <p>Proposed file</p>
      <MonacoEditor
        value={currentPreview.content}
        language={currentPreview.runtime === 'python'
          ? 'python'
          : 'javascript'}
        readOnly
      />
      <button
        type="button"
        class="secondary-button"
        disabled={busy}
        onclick={() => {
          preview = null;
          void create();
        }}>Refresh preview from disk</button
      >
    </section>
  {/if}
  <button class="primary-button" disabled={busy}
    >{busy
      ? addingToWorker && !currentPreview
        ? 'Preparing preview…'
        : 'Creating…'
      : addingToWorker && !currentPreview
        ? 'Preview handler'
        : `Create ${label}`}</button
  >
</form>

<style>
  .handler-preview {
    min-width: 0;
    margin-block: 1rem;
  }
  .handler-preview pre {
    overflow: auto;
    max-height: 22rem;
  }
  .handler-preview details {
    margin-block: 1rem;
  }
</style>
