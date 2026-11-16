<script lang="ts">
  let { text }: { text: string } = $props();

  function tokenize(source: string) {
    const tokens: { text: string; kind?: string }[] = [];
    // Keep large results readable without constructing a DOM node for every value.
    const prefix = source.slice(0, 128_000);
    const pattern =
      /("(?:\\[\s\S]|[^"\\])*(?:"|\\?$))(\s*:)?|\b(true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
    let end = 0;
    for (const match of prefix.matchAll(pattern)) {
      if (match.index > end)
        tokens.push({ text: source.slice(end, match.index) });
      const kind = match[2]
        ? 'key'
        : match[1]
          ? 'string'
          : match[3]
            ? 'literal'
            : 'number';
      tokens.push({ text: match[0], kind });
      end = match.index + match[0].length;
      if (tokens.length >= 3000) break;
    }
    if (end < source.length) tokens.push({ text: source.slice(end) });
    return tokens;
  }
  let tokens = $derived(tokenize(text));
</script>

{#each tokens as token}{#if token.kind}<span class={token.kind}
      >{token.text}</span
    >{:else}{token.text}{/if}{/each}

<style>
  .key {
    color: #384daa;
  }
  .string {
    color: #14673e;
  }
  .number {
    color: #914414;
  }
  .literal {
    color: #80349c;
  }
  :global([data-theme='dark']) .key {
    color: #b5c1ff;
  }
  :global([data-theme='dark']) .string {
    color: #90d6b0;
  }
  :global([data-theme='dark']) .number {
    color: #f2b58b;
  }
  :global([data-theme='dark']) .literal {
    color: #dfabef;
  }
</style>
