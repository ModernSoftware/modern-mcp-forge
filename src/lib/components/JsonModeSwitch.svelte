<script lang="ts">
  let {
    checked,
    disabled = false,
    onchange
  }: {
    checked: boolean;
    disabled?: boolean;
    onchange: (checked: boolean) => void | boolean;
  } = $props();
</script>

<label class="switch">
  <input
    type="checkbox"
    role="switch"
    {checked}
    {disabled}
    onchange={(event) => {
      if (onchange(event.currentTarget.checked) === false)
        event.currentTarget.checked = checked;
    }}
  /> Edit as JSON
</label>

<style>
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.83rem;
    cursor: pointer;
  }
  .switch input {
    appearance: none;
    width: 2.4rem;
    height: 1.35rem;
    min-height: 0;
    margin: 0;
    padding: 2px;
    border: 1px solid var(--muted);
    border-radius: 1rem;
    background: var(--surface-3);
    cursor: pointer;
  }
  .switch input::before {
    content: '';
    display: block;
    width: 0.95rem;
    height: 0.95rem;
    border-radius: 100%;
    background: var(--muted);
  }
  .switch input:checked {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
  .switch input:checked::before {
    background: var(--accent);
    transform: translateX(1rem);
  }
  .switch input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .switch input:disabled {
    cursor: default;
    opacity: 0.6;
  }
  @media (forced-colors: active) {
    .switch input {
      appearance: auto;
    }
  }
</style>
