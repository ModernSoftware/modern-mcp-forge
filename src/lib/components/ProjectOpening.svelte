<script lang="ts">
  import { onMount } from 'svelte';
  import { preloadCode } from '$app/navigation';
  import type { ProjectSourceManager } from '$lib/server/sources/manager';

  let {
    name,
    projectId,
    navigating = false
  }: {
    name: string;
    projectId?: string;
    navigating?: boolean;
  } = $props();
  type Progress = ReturnType<ProjectSourceManager['startupProgress']>;
  let progress = $state.raw<Progress>();
  let dialog: HTMLDialogElement;
  const id = $props.id();

  onMount(() => {
    dialog.showModal();
    void preloadCode('/workspace').catch(() => {});
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function update() {
      if (navigating || controller.signal.aborted) return;
      try {
        const response = await fetch('/api/project/sources?progress', {
          signal: controller.signal,
          cache: 'no-store'
        });
        if (response.ok) {
          const state: Progress = await response.json();
          if (state.project === projectId && state.status === 'starting')
            progress = state;
        }
      } catch {
        // The activation request owns the outcome. Progress is informational.
      }
      if (!controller.signal.aborted && !navigating)
        timer = setTimeout(update, 700);
    }
    if (projectId) timer = setTimeout(update, 350);
    return () => {
      controller.abort();
      clearTimeout(timer);
      dialog.close();
    };
  });
</script>

<dialog
  bind:this={dialog}
  aria-labelledby={id}
  oncancel={(event) => event.preventDefault()}
>
  <p class="eyebrow">PROJECT WORKSPACE</p>
  <h2 {id}>Opening {name}</h2>
  <div role="status">
    {#if navigating}
      <p>Loading the workspace…</p>
    {:else if progress}
      <p>
        Checked {progress.finished} of {progress.total} enabled {progress.total ===
        1
          ? 'source'
          : 'sources'}.
      </p>
      {#if progress.starting.length}<small
          >Discovering capabilities from {progress.starting.join(', ')}…</small
        >{/if}
    {:else}
      <p>Preparing the project and its enabled sources…</p>
    {/if}
  </div>
  {#if progress && progress.total && !navigating}
    <progress
      aria-label="Source startup"
      value={progress.finished}
      max={progress.total}
    ></progress>
  {:else}
    <progress aria-label="Opening project"></progress>
  {/if}
</dialog>

<style>
  dialog {
    width: min(26rem, calc(100% - 2rem));
    padding: 1.4rem;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface-solid);
    color: var(--text);
    box-shadow: var(--shadow);
    overflow-wrap: anywhere;
  }
  dialog::backdrop {
    background: rgb(12 17 31 / 55%);
  }
  h2 {
    font-size: 1.2rem;
    margin: 0.35rem 0 1rem;
  }
  p {
    margin: 0;
  }
  small {
    display: block;
    margin-top: 0.4rem;
    color: var(--muted);
  }
  progress {
    display: block;
    width: 100%;
    height: 0.45rem;
    margin-top: 1rem;
    accent-color: var(--accent);
  }
</style>
