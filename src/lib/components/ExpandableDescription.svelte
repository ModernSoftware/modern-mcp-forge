<script lang="ts">
  let { text = '' } = $props<{ text?: string }>();
  const id = $props.id();
  let expanded = $state(false);
  let full = $derived(text.trim().replace(/\r\n?/g, '\n'));
  // Limit both long prose and short, newline-heavy descriptions.
  let preview = $derived(
    full
      .slice(0, 220)
      .split(/\r?\n/)
      .slice(0, 3)
      .join('\n')
      .trimEnd()
      .replace(/[\uD800-\uDBFF]$/, '')
  );
  let truncated = $derived(full.length > preview.length);
</script>

<p {id}>
  {full
    ? expanded || !truncated
      ? full
      : preview + '…'
    : 'No description yet.'}
</p>
{#if truncated}
  <button
    type="button"
    aria-controls={id}
    aria-expanded={expanded}
    onclick={() => (expanded = !expanded)}
  >
    {expanded ? 'Show less' : 'Show more'}
  </button>
{/if}

<style>
  p {
    white-space: pre-line;
    overflow-wrap: anywhere;
    color: var(--muted);
    margin: 0.35rem 0;
  }
  button {
    cursor: pointer;
    color: var(--accent);
    background: transparent;
    border: 0;
    font: inherit;
    padding: 0.2rem 0;
    text-decoration: underline;
  }
</style>
