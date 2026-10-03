<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import type { ProjectSource } from '$lib/server/sources/schema';
  import type { ProjectSourceManager } from '$lib/server/sources/manager';
  let { projectId, sources, snapshot, catalogError } = $props<{
    projectId: string;
    sources: ProjectSource[];
    snapshot: ReturnType<ProjectSourceManager['snapshot']>;
    catalogError?: string;
  }>();
  let id = $state('');
  let mode = $state('attach');
  let runtime = $state('node');
  let manifest = $state('');
  let busy = $state(false);
  let error = $state('');

  async function action(body: Record<string, unknown>) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      const response = await fetch('/api/project/native', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          generation: snapshot.generation,
          ...body
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      await invalidateAll();
      if (body.action === 'create' || body.action === 'attach') {
        await goto(`/project/native/${encodeURIComponent(String(body.id))}`);
      }
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    } finally {
      busy = false;
    }
  }
  async function reload() {
    busy = true;
    error = '';
    try {
      const response = await fetch('/api/project/sources', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'reload', projectId })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    } finally {
      busy = false;
      await invalidateAll();
    }
  }
</script>

<section class="glass-card sources">
  <div class="heading">
    <div>
      <div class="eyebrow">PROJECT SOURCES</div>
      <h2>Sources</h2>
    </div>
    <button disabled={busy} onclick={reload}>Reload sources</button>
  </div>
  <p>
    Author portable Node and Python capabilities, then test them through this
    project's <code>/mcp</code> endpoint.
  </p>
  {#if error || snapshot.error || catalogError}<p role="alert" class="error">
      {error || snapshot.error || catalogError}
    </p>{/if}
  {#each sources as source (source.id)}
    {@const state =
      snapshot.project === projectId
        ? snapshot.sources.find(
            (item: { id: string; status: string }) => item.id === source.id
          )
        : undefined}
    <div class="source">
      <div>
        <strong>{source.id}</strong> · {source.kind} · {state?.status ??
          'stopped'}
        {#if source.kind === 'native'}<div>
            <code>{source.manifest}</code>
          </div>{/if}
      </div>
      {#if source.kind === 'native'}
        <a href={`/project/native/${encodeURIComponent(source.id)}`}
          >Edit &amp; test</a
        >
        <button
          disabled={busy}
          onclick={() =>
            action({
              action: source.enabled ? 'disable' : 'enable',
              id: source.id
            })}>{source.enabled ? 'Disable' : 'Enable'}</button
        >
        <button
          disabled={busy}
          onclick={() => {
            if (
              window.confirm(`Detach ${source.id}? Files will remain on disk.`)
            )
              void action({ action: 'remove', id: source.id });
          }}>Detach</button
        >
      {/if}
    </div>
  {/each}
  <form
    onsubmit={(event) => {
      event.preventDefault();
      void action(
        mode === 'create'
          ? { action: 'create', id, runtime }
          : { action: 'attach', id, manifest }
      );
    }}
  >
    <h3>Attach an existing native source</h3>
    <p>To create new capabilities, use <a href="/workspace/new">Add capability</a> in the workspace.</p>
    <div class="fields">
      <label
        >Source ID<input
          bind:value={id}
          required
          maxlength="64"
          disabled={busy}
          placeholder="support"
        /></label
      >
      <label
        >Source<select bind:value={mode} disabled={busy}
          ><option value="attach"
            >Attach existing manifest</option
          ></select
        ></label
      >
      {#if mode === 'create'}
        <label
          >Runtime<select bind:value={runtime} disabled={busy}
            ><option value="node">Node</option><option value="python"
              >Python</option
            ></select
          ></label
        >
      {:else}
        <label
          >Manifest path<input
            bind:value={manifest}
            required
            disabled={busy}
            placeholder="native/support/mcpack.json"
          /></label
        >
      {/if}
      <button disabled={busy}>{busy ? 'Working…' : 'Add source'}</button>
    </div>
    <p class="note">
      Use a project-relative manifest. Attaching starts trusted local code. Disabling a source stops its workers and removes its capabilities from discovery.
    </p>
  </form>
</section>

<style>
  .sources {
    padding: 22px;
    margin-bottom: 22px;
  }
  .heading,
  .source,
  .fields {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }
  .heading {
    justify-content: space-between;
  }
  h2,
  h3 {
    margin: 5px 0;
  }
  p {
    color: var(--muted);
    font-size: 0.8rem;
    line-height: 1.5;
  }
  .source {
    border-top: 1px solid var(--border);
    padding: 14px 0;
  }
  .source > div {
    flex: 1;
    min-width: 180px;
  }
  code {
    overflow-wrap: anywhere;
  }
  form {
    margin-top: 18px;
  }
  label {
    display: grid;
    gap: 6px;
    flex: 1;
    font-size: 0.8rem;
  }
  input,
  select,
  button {
    min-width: 0;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-solid);
    color: var(--text);
  }
  button {
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
  }
  a {
    color: var(--accent);
  }
  .error {
    color: var(--danger, #c44);
  }
  .note {
    font-size: 0.72rem;
  }
</style>
