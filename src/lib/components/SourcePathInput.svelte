<script lang="ts">
  import { onDestroy } from 'svelte';
  let {
    label,
    projectId,
    kind,
    value = $bindable(''),
    checkoutEnv,
    placeholder = '',
    required = false,
    disabled = false,
    browseDisabled = false
  } = $props<{
    label: string;
    projectId: string;
    kind: 'file' | 'manifest' | 'directory';
    value: string;
    checkoutEnv?: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    browseDisabled?: boolean;
  }>();
  const id = $props.id();
  let dialog: HTMLDialogElement;
  type Listing = {
    root: string;
    path: string;
    parent: string | null;
    entries: { name: string; path: string; directory: boolean }[];
  };
  let listing = $state<Listing | null>(null);
  let problem = $state('');
  let loading = $state(false);
  let pending: AbortController | undefined;
  onDestroy(() => pending?.abort());

  async function browse(directory: string) {
    pending?.abort();
    const controller = (pending = new AbortController());
    loading = true;
    problem = '';
    try {
      const response = await fetch('/api/project/paths', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ projectId, kind, directory, checkoutEnv })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (!controller.signal.aborted) listing = data;
    } catch (error) {
      if (!controller.signal.aborted)
        problem =
          error instanceof Error ? error.message : 'Could not open folder.';
    } finally {
      if (pending === controller) loading = false;
    }
  }

  function open() {
    listing = null;
    dialog.showModal();
    void browse('.');
  }
  function choose(path: string) {
    value = path || '.';
    dialog.close();
  }
</script>

<div class="path-field">
  <label for={id}>{label}</label>
  <div class="controls">
    <input {id} name={id} bind:value {placeholder} {required} {disabled} />
    <button
      type="button"
      aria-label={'Browse for ' + label}
      disabled={disabled || browseDisabled}
      onclick={open}>Browse…</button
    >
  </div>
</div>
<dialog
  bind:this={dialog}
  aria-labelledby={id + '-title'}
  onclose={() => pending?.abort()}
>
  <h2 id={id + '-title'}>{label}</h2>
  {#if listing}<p class="location">
      {listing.root}{listing.path ? '/' + listing.path : ''}
    </p>{/if}
  {#if problem}<p role="alert">{problem}</p>{/if}
  {#if loading}<p role="status">Loading folder…</p>{/if}
  {#if listing}
    <div class="entries">
      {#if listing.parent !== null}<button
          type="button"
          disabled={loading}
          onclick={() => browse(listing!.parent!)}>↑ Parent folder</button
        >{/if}
      {#each listing.entries as entry (entry.path)}
        <button
          type="button"
          disabled={loading}
          onclick={() =>
            entry.directory ? browse(entry.path) : choose(entry.path)}
        >
          {entry.name}{entry.directory ? '/' : ''}
        </button>
      {/each}
      {#if !listing.entries.length}<p>
          No matching entries in this folder.
        </p>{/if}
    </div>
  {/if}
  <div class="actions">
    {#if kind === 'directory' && listing}<button
        type="button"
        disabled={loading}
        onclick={() => choose(listing!.path)}>Select this folder</button
      >{/if}
    <button type="button" onclick={() => dialog.close()}>Cancel</button>
  </div>
</dialog>

<style>
  .path-field {
    display: grid;
    gap: 6px;
    min-width: 0;
    flex: 1;
  }
  .controls,
  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  input {
    min-width: 0;
    flex: 1;
    padding: 0.65rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    background: var(--surface-solid);
  }
  dialog {
    width: min(32rem, 90vw);
    max-height: 80vh;
    color: var(--text);
    background: var(--surface-solid);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.25rem;
  }
  dialog::backdrop {
    background: #10172588;
  }
  h2 {
    margin: 0;
    font-size: 1.2rem;
  }
  .location {
    overflow-wrap: anywhere;
    color: var(--muted);
  }
  .entries {
    display: grid;
    max-height: 45vh;
    overflow: auto;
    gap: 0.25rem;
  }
  button {
    font: inherit;
    color: var(--text);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.55rem 0.75rem;
    cursor: pointer;
  }
  .entries button {
    text-align: left;
    overflow-wrap: anywhere;
  }
  .actions {
    justify-content: flex-end;
    margin-top: 1rem;
  }
</style>
