<script lang="ts">
  import { onDestroy } from 'svelte';
  import SampleWorker from '$lib/testing/sample-arguments.worker?worker';

  let { schema, text = $bindable() }: { schema: unknown; text: string } =
    $props();
  let busy = $state(false);
  let candidate = $state<string>();
  let message = $state('');
  let worker: Worker | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function stop() {
    clearTimeout(timeout);
    worker?.terminate();
    worker = undefined;
    busy = false;
  }
  onDestroy(stop);

  function insert(sample: string) {
    text = sample;
    candidate = undefined;
    message = 'Sample inserted. Review the values before running.';
  }

  function populate() {
    stop();
    candidate = undefined;
    message = '';
    const originalSchema = schema;
    function finish(sample?: string) {
      stop();
      if (schema !== originalSchema) return;
      if (sample === undefined) {
        message =
          'Forge could not generate a validated sample. You can still enter the arguments manually.';
      } else if (!text.trim() || /^\s*\{\s*\}\s*$/.test(text)) {
        insert(sample);
      } else {
        candidate = sample;
      }
    }
    try {
      busy = true;
      worker = new SampleWorker();
      worker.onmessage = (event: MessageEvent<string | undefined>) =>
        finish(event.data);
      worker.onerror = () => finish();
      // A complex schema or pattern must not stall the editor.
      timeout = setTimeout(() => finish(), 5000);
      worker.postMessage(JSON.stringify(schema));
    } catch {
      finish();
    }
  }
</script>

<div class="sample">
  {#if candidate !== undefined}
    <span>Replace your current arguments with the sample?</span>
    <button
      class="secondary-button"
      type="button"
      onclick={() => insert(candidate!)}>Replace draft</button
    >
    <button
      class="secondary-button"
      type="button"
      onclick={() => {
        candidate = undefined;
        message = 'Current draft kept.';
      }}>Keep draft</button
    >
  {:else}
    <button
      class="secondary-button"
      type="button"
      disabled={busy}
      onclick={populate}>{busy ? 'Generating…' : 'Populate sample'}</button
    >
  {/if}
  <span role="status"
    >{candidate !== undefined ? 'Sample ready.' : message}</span
  >
</div>

<style>
  .sample {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.65rem;
    margin: 0.6rem 0;
  }
  .sample span {
    font-size: 0.82rem;
    color: var(--muted);
  }
  .sample button {
    padding: 0.3rem 0.65rem;
    min-height: 2rem;
    font-size: 0.82rem;
  }
</style>
