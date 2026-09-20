<script lang="ts">
  import { onMount } from 'svelte';

  let theme = $state<'light' | 'dark'>('light');

  onMount(() => {
    theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  });

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('mcp-forge-theme', theme);
  }
</script>

<button
  class="theme-switch"
  type="button"
  aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
  title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
  onclick={toggleTheme}
>
  <span class="symbol">☀</span>
  <span class="track" class:dark={theme === 'dark'}>
    <span class="thumb"></span>
  </span>
  <span class="symbol">☾</span>
</button>

<style>
  .theme-switch {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 9px;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--muted);
    background: var(--surface);
    backdrop-filter: blur(16px);
    cursor: pointer;
  }

  .symbol {
    width: 14px;
    font-size: 0.78rem;
    line-height: 1;
    text-align: center;
  }

  .track {
    position: relative;
    width: 42px;
    height: 23px;
    border-radius: 999px;
    background: var(--surface-3);
    box-shadow: inset 0 0 0 1px var(--border);
  }

  .thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 17px;
    height: 17px;
    border-radius: 50%;
    background: var(--surface-solid);
    box-shadow: 0 2px 7px rgb(0 0 0 / 0.18);
    transition: transform 180ms ease;
  }

  .track.dark .thumb {
    transform: translateX(19px);
  }
</style>
