<script lang="ts">
  import JsonSyntax from './JsonSyntax.svelte';

  let {
    id,
    text = $bindable(),
    invalid = false
  }: {
    id: string;
    text: string;
    invalid?: boolean;
  } = $props();
  let backdrop: HTMLPreElement;
  let input: HTMLTextAreaElement;

  function align() {
    if (backdrop && input) {
      backdrop.scrollTop = input.scrollTop;
      backdrop.scrollLeft = input.scrollLeft;
    }
  }
  $effect(() => {
    void text;
    align();
  });
</script>

<div class="json-input">
  <pre aria-hidden="true" bind:this={backdrop}><JsonSyntax {text} />{'\n'}</pre>
  <textarea
    {id}
    bind:this={input}
    bind:value={text}
    aria-invalid={invalid}
    wrap="off"
    rows="8"
    spellcheck="false"
    autocapitalize="off"
    onscroll={align}></textarea>
</div>

<style>
  .json-input {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-solid);
  }
  .json-input:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .json-input pre,
  .json-input textarea {
    display: block;
    width: 100%;
    min-width: 0;
    margin: 0;
    padding: 0.75rem;
    border: 0;
    border-radius: 0;
    font:
      0.875rem/1.55 'Cascadia Code',
      'SFMono-Regular',
      Consolas,
      monospace;
    white-space: pre;
    tab-size: 2;
  }
  .json-input pre {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    /* Match the textarea's scroll range even with classic scrollbars. */
    padding-right: calc(0.75rem + 24px);
    padding-bottom: calc(0.75rem + 24px);
    color: var(--text);
  }
  .json-input textarea {
    position: relative;
    resize: vertical;
    min-height: 6rem;
    background: transparent;
    color: transparent;
    caret-color: var(--text);
    outline: none;
  }
  @media (forced-colors: active) {
    .json-input pre {
      display: none;
    }
    .json-input textarea {
      color: CanvasText;
    }
  }
</style>
