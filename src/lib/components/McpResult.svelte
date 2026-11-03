<script lang="ts">
  import { isObject } from '$lib/testing/tool-arguments';
  import JsonSyntax from './JsonSyntax.svelte';

  let { result, heading = 'Result' }: { result: unknown; heading?: string } =
    $props();
  let raw = $state(false);
  let failedImages = $state<number[]>([]);
  let tool = $derived(
    isObject(result) && Array.isArray(result.content) ? result : undefined
  );
  let content = $derived((tool?.content ?? []) as unknown[]);

  function pretty(value: unknown) {
    return JSON.stringify(value, null, 2);
  }
  function jsonText(text: string) {
    if (!/^\s*[\[{]/.test(text)) return;
    try {
      return pretty(JSON.parse(text));
    } catch {
      return;
    }
  }
  function imageSource(block: Record<string, unknown>) {
    if (
      typeof block.mimeType !== 'string' ||
      typeof block.data !== 'string' ||
      !block.data.length
    )
      return;
    const mime = block.mimeType.toLowerCase();
    if (
      ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime) &&
      block.data.length <= 8_000_000
    )
      return 'data:' + mime + ';base64,' + block.data;
  }
</script>

<section class="result" aria-label="Request result">
  <header>
    <h3>{heading}</h3>
    {#if tool}
      <div class="views" role="group" aria-label="Result view">
        <button type="button" aria-pressed={!raw} onclick={() => (raw = false)}
          >Preview</button
        >
        <button type="button" aria-pressed={raw} onclick={() => (raw = true)}
          >Raw JSON</button
        >
      </div>
    {/if}
  </header>
  {#if tool?.isError === true}<p class="failure" role="status">
      The tool returned an error.
    </p>{/if}
  {#if raw || !tool}
    <pre aria-label="Result JSON"><JsonSyntax text={pretty(result)} /></pre>
  {:else}
    {#if Object.hasOwn(tool, 'structuredContent')}
      <h4>Structured content</h4>
      <pre><JsonSyntax text={pretty(tool.structuredContent)} /></pre>
    {/if}
    {#each content as block, index}
      {#if isObject(block) && block.type === 'text' && typeof block.text === 'string'}
        {@const json = jsonText(block.text)}
        {#if json !== undefined}
          <pre><JsonSyntax text={json} /></pre>
        {:else}<pre class="text">{block.text}</pre>{/if}
      {:else if isObject(block) && block.type === 'image'}
        {@const src = imageSource(block)}
        <figure>
          {#if src && !failedImages.includes(index)}
            <img
              {src}
              alt={'Tool result image ' + (index + 1)}
              onerror={() => (failedImages = [...failedImages, index])}
            />
            <figcaption>{block.mimeType}</figcaption>
          {:else}<figcaption>
              Image preview unavailable. Open Raw JSON for the original data.
            </figcaption>{/if}
        </figure>
      {:else}
        <pre><JsonSyntax text={pretty(block)} /></pre>
      {/if}
    {/each}
    {#if !content.length && !Object.hasOwn(tool, 'structuredContent')}
      <p class="empty">The tool returned no content.</p>
    {/if}
  {/if}
</section>

<style>
  .result {
    min-width: 0;
    margin: 1rem 0;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
  }
  h3,
  h4 {
    margin: 0;
  }
  h4,
  figcaption,
  .empty {
    font-size: 0.85rem;
    color: var(--muted);
    margin-top: 0.7rem;
  }
  .views {
    display: inline-flex;
    gap: 0.15rem;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 3px;
  }
  .views button {
    padding: 0.35rem 0.65rem;
    color: var(--muted);
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    font-size: 0.82rem;
    cursor: pointer;
  }
  .views button[aria-pressed='true'] {
    background: var(--surface-solid);
    color: var(--text);
    border-color: var(--border);
    font-weight: 700;
  }
  pre,
  figure {
    margin: 0.55rem 0 0;
    padding: 0.8rem 1rem;
    background: var(--surface-solid);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    max-height: 25rem;
    overflow: auto;
  }
  pre {
    font-size: 0.85rem;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .text {
    font-family: inherit;
  }
  img {
    display: block;
    max-width: 100%;
    max-height: 20rem;
    object-fit: contain;
  }
  .failure {
    color: var(--danger);
  }
</style>
