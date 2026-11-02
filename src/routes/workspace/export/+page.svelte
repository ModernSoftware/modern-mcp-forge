<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  let { data } = $props();
  let selected = $state<string[]>([]);
  let busy = $state(false);
  let message = $state('');
  let problem = $state('');
  $effect(() => {
    const preview = data.preview;
    selected =
      preview?.files.filter((f) => f.suggested).map((f) => f.path) ?? [];
    message = '';
    problem = '';
  });
  async function download() {
    if (!data.preview) return;
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
          files: selected
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
  <section class="glass-card">
    <h2>No enabled native sources</h2>
    <p>
      Enable a native source in Configuration or create a native capability to
      export.
    </p>
    <a href="/project">Open Configuration</a>
  </section>
{:else}
  <section class="glass-card">
    <label
      >Native source
      <select
        value={data.id}
        disabled={busy}
        onchange={(e) =>
          goto(
            '/workspace/export?source=' +
              encodeURIComponent(e.currentTarget.value)
          )}
      >
        {#each data.sources as id}<option value={id}>{id}</option>{/each}
      </select>
    </label>
    <p>
      Each download runs one source. Disabled capabilities, bridge adapters and
      remote connections stay in Forge.
    </p>
    {#if data.issue}<p role="alert" class="workflow-error">{data.issue}</p>{/if}
    {#if data.preview}
      <h2>Review pack contents</h2>
      <p>
        {data.preview.counts.tools} tools · {data.preview.counts.resources} resources
        · {data.preview.counts.prompts} prompts
      </p>
      <p>
        Worker entrypoints are required. Select any helper modules, dependency
        files and data your workers read. Paths are relative to the source
        manifest.
      </p>
      <fieldset>
        <legend>Files to include</legend>
        {#each data.preview.files as file}
          <label class="asset"
            ><input
              type="checkbox"
              value={file.path}
              bind:group={selected}
              disabled={file.required || busy}
            />
            <code>{file.path}</code>{#if file.required}<small>Required</small
              >{/if}
          </label>
        {/each}
      </fieldset>
      {#if data.preview.environment.length}<p>
          Set worker variables on the deployment host: <code
            >{data.preview.environment.join(', ')}</code
          >. The export stores their names only.
        </p>{/if}
      <p>
        The archive includes a locked MCPack runtime dependency and launch
        instructions. Review selected files and worker configuration for
        credentials before sharing.
      </p>
      <button class="primary-button" disabled={busy} onclick={download}
        >{busy ? 'Preparing download…' : 'Download .tar.gz'}</button
      >
    {/if}
    <button
      class="secondary-button"
      disabled={busy}
      onclick={() => invalidateAll()}>Refresh file list</button
    >
    {#if problem}<p role="alert" class="workflow-error">{problem}</p>{/if}
    {#if message}<p role="status">{message}</p>{/if}
  </section>
{/if}

<style>
  fieldset {
    max-height: 22rem;
    overflow: auto;
    margin: 1rem 0;
    border: 1px solid var(--border);
    border-radius: 0.6rem;
  }
  label.asset {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin: 0.4rem 0;
  }
  .asset input {
    width: auto;
  }
  code {
    overflow-wrap: anywhere;
  }
</style>
