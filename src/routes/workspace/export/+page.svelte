<script lang="ts">
  import { tick } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import {
    capabilityKey,
    capabilityKinds,
    exportContents
  } from '$lib/deployment/selection';
  import ExpandableDescription from '$lib/components/ExpandableDescription.svelte';

  const labels = { tools: 'Tools', resources: 'Resources', prompts: 'Prompts' };
  let { data } = $props();
  let selected = $derived(data.preview?.capabilities.map(capabilityKey) ?? []);
  let extras = $state<string[]>([]);
  let busy = $state(false);
  let message = $state('');
  let problem = $state('');
  let contents = $derived(
    data.preview && exportContents(data.preview, selected)
  );
  let additional = $derived(
    data.preview?.files.filter((f) => !contents?.required.has(f.path)) ?? []
  );
  $effect(() => {
    // A refreshed preview belongs to a new review, including after switching sources.
    void data.preview;
    extras = [];
    message = '';
    problem = '';
  });
  async function changeSource(id: string) {
    busy = true;
    try {
      await goto('/workspace/export?source=' + encodeURIComponent(id));
    } finally {
      busy = false;
    }
  }
  async function refresh() {
    const previous = data;
    const keep = new Set(selected);
    const files = new Set(extras);
    busy = true;
    try {
      await invalidateAll();
      await tick();
      if (
        previous.preview &&
        data.preview &&
        previous.projectId === data.projectId &&
        previous.id === data.id
      ) {
        selected = data.preview.capabilities
          .map(capabilityKey)
          .filter((key) => keep.has(key));
        extras = data.preview.files
          .filter((file) => files.has(file.path))
          .map((file) => file.path);
      }
    } catch (error) {
      problem =
        error instanceof Error
          ? error.message
          : 'Could not refresh the preview.';
    } finally {
      busy = false;
    }
  }
  async function download() {
    if (!data.preview || !selected.length || busy) return;
    const id = data.id;
    problem = '';
    message = '';
    busy = true;
    try {
      const response = await fetch('/api/project/export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: data.projectId,
          id,
          revision: data.preview.revision,
          capabilities: selected,
          files: extras
        })
      });
      if (!response.ok) throw new Error((await response.json()).error);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = id + '-native.tar.gz';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      message =
        'Download started. Extract the archive and follow its README to start the server.';
    } catch (error) {
      problem =
        error instanceof Error
          ? error.message
          : 'Unable to download this pack.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Export native pack · Modern MCP Forge</title></svelte:head>
<a href="/workspace">← Workspace</a>
<section class="page-heading">
  <div>
    <div class="eyebrow">DEPLOYMENT</div>
    <h1>Export native pack</h1>
    <p>Download a native source as a standalone MCPack HTTP or stdio server.</p>
  </div>
</section>
{#if !data.sources.length}
  <section class="glass-card workflow-form">
    <h2>No enabled native sources</h2>
    <p>
      Enable a native source in Configuration or create a native capability to
      export.
    </p>
    <a href="/project">Open Configuration</a>
  </section>
{:else}
  <section class="glass-card workflow-form export-panel">
    <label class="source-picker"
      >Native source
      <select
        value={data.id}
        disabled={busy}
        onchange={(e) => changeSource(e.currentTarget.value)}
      >
        {#each data.sources as id}<option value={id}>{id}</option>{/each}
      </select>
    </label>
    <p class="workflow-muted">
      Each download deploys one native source. Your workspace settings stay the
      same.
    </p>
    {#if data.issue}<p role="alert" class="workflow-error">{data.issue}</p>{/if}
    {#if data.preview && contents}
      <h2>Capabilities to include</h2>
      <p>
        Choose what clients can discover and call in the deployed server. Only
        capabilities enabled in Forge appear here.
      </p>
      {#each capabilityKinds as kind}
        {@const items = data.preview.capabilities.filter(
          (item) => item.kind === kind
        )}
        {#if items.length}
          <fieldset disabled={busy}>
            <legend>{labels[kind]}</legend>
            {#each items as item}
              <div class="capability">
                <label
                  ><input
                    type="checkbox"
                    value={capabilityKey(item)}
                    bind:group={selected}
                  /><code>{item.name}</code></label
                >
                {#if item.description}<ExpandableDescription
                    text={item.description}
                  />{/if}
              </div>
            {/each}
          </fieldset>
        {/if}
      {/each}
      <p role="status">
        {selected.length} of {data.preview.capabilities.length} selected.
      </p>
      <details>
        <summary>Review deployment files</summary>
        <p>
          Forge includes the host, launch instructions and pack manifest. Your
          selection also includes these source files automatically.
        </p>
        <ul>
          {#each [...contents.required].sort() as path}<li>
              <code>{path}</code>
            </li>{/each}
        </ul>
        {#if additional.length}
          <fieldset disabled={busy}>
            <legend>Additional files</legend>
            <p>
              Include any helpers or data your selected workers import or read.
              Adding a file does not publish a capability.
            </p>
            {#each additional as file}<label
                ><input
                  type="checkbox"
                  value={file.path}
                  bind:group={extras}
                /><code>{file.path}</code></label
              >{/each}
          </fieldset>
        {/if}
      </details>
      {#if contents.environment.length}<p>
          Set these worker variables on the deployment host: <code
            >{contents.environment.join(', ')}</code
          >.
        </p>{/if}
      <p class="workflow-muted">
        Review worker configuration and additional files for credentials before
        sharing.
      </p>
    {/if}
    <div class="actions">
      {#if data.preview}<button
          class="primary-button"
          disabled={busy || !selected.length}
          onclick={download}>{busy ? 'Preparing…' : 'Download .tar.gz'}</button
        >{/if}
      <button class="secondary-button" disabled={busy} onclick={refresh}
        >Refresh preview</button
      >
    </div>
    {#if problem}<p role="alert" class="workflow-error">{problem}</p>{/if}
    {#if message}<p role="status">{message}</p>{/if}
  </section>
{/if}

<style>
  .export-panel {
    max-width: 56rem;
  }
  .source-picker {
    max-width: 24rem;
  }
  h2 {
    margin: 1.5rem 0 0.4rem;
  }
  p {
    line-height: 1.5;
  }
  fieldset,
  details {
    min-width: 0;
    margin: 1rem 0;
    padding: 0.8rem 1rem;
    border: 1px solid var(--border);
    border-radius: 0.6rem;
  }
  legend,
  summary {
    font-weight: 700;
  }
  summary {
    cursor: pointer;
  }
  fieldset label,
  .actions {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  fieldset label {
    padding: 0.35rem 0;
    cursor: pointer;
  }
  fieldset input {
    accent-color: var(--accent);
  }
  code {
    overflow-wrap: anywhere;
  }
  .actions {
    flex-wrap: wrap;
  }
  .capability + .capability {
    margin-top: 0.6rem;
  }
</style>
