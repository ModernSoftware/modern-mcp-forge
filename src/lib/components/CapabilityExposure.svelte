<script lang="ts">
  import type { ExposureRule } from '$lib/server/sources/schema';
  let {
    kind,
    identity,
    rule,
    publicName,
    busy,
    save
  }: {
    kind: ExposureRule['kind'];
    identity: string;
    rule?: ExposureRule;
    publicName?: string;
    busy: boolean;
    save: (rule: ExposureRule) => Promise<void>;
  } = $props();
  let open = $state(false);
  let visible = $state(true);
  let alias = $state('');
  let description = $state('');
  $effect(() => {
    visible = !rule?.hidden;
    alias = rule?.alias ?? '';
    description = rule?.description ?? '';
  });
</script>

<details class="exposure" bind:open>
  <summary>Agent exposure · {publicName ?? 'Hidden'}</summary>
  {#if open}
    <div class="workflow-form exposure-form">
      <dl class="identity">
        <dt>{kind === 'resources' ? 'Original URI' : 'Original name'}</dt>
        <dd><code>{identity}</code></dd>
        <dt>Published name</dt>
        <dd>{publicName ?? 'Hidden from agents'}</dd>
      </dl>
      <p class="workflow-muted">
        Choose how agents see this capability. Reconnect your agent after
        saving.
      </p>
      <label class="visibility"
        ><input
          type="checkbox"
          role="switch"
          bind:checked={visible}
          disabled={busy}
        /> Expose to agents</label
      >
      <label
        >Public alias<input
          bind:value={alias}
          maxlength="64"
          placeholder="Use connection naming"
          disabled={busy}
        /></label
      >
      <label
        >Local description<textarea
          bind:value={description}
          maxlength="16000"
          placeholder="Use upstream description"
          disabled={busy}></textarea></label
      >
      <div class="exposure-actions">
        <button
          class="primary-button"
          type="button"
          disabled={busy}
          onclick={() =>
            save({
              kind,
              identity,
              ...(visible ? {} : { hidden: true }),
              ...(alias.trim() && { alias: alias.trim() }),
              ...(description.trim() && { description: description.trim() })
            })}>Save exposure</button
        >
        {#if rule}<button
            class="secondary-button"
            type="button"
            disabled={busy}
            onclick={() => save({ kind, identity })}
            >Restore upstream defaults</button
          >{/if}
      </div>
    </div>
  {/if}
</details>

<style>
  .exposure {
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }
  summary {
    padding: 0.8rem 1rem;
    font-weight: 700;
    cursor: pointer;
    background: var(--surface-solid);
    overflow-wrap: anywhere;
  }
  .exposure-form {
    padding: 1rem;
    border-top: 1px solid var(--border);
  }
  .exposure-form input:not([type='checkbox']),
  .exposure-form textarea {
    width: 100%;
    min-width: 0;
  }
  .identity {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.4rem 1rem;
    font-size: 0.85rem;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .exposure-form .visibility {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .visibility {
    cursor: pointer;
  }
  .visibility input {
    appearance: none;
    flex-shrink: 0;
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
  .visibility input::before {
    content: '';
    display: block;
    width: 0.95rem;
    height: 0.95rem;
    border-radius: 100%;
    background: var(--muted);
  }
  .visibility input:checked {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
  .visibility input:checked::before {
    background: var(--accent);
    transform: translateX(1rem);
  }
  .visibility input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .visibility input:disabled {
    cursor: default;
    opacity: 0.6;
  }
  .exposure-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }
  @media (max-width: 600px) {
    .identity {
      grid-template-columns: 1fr;
    }
    dd + dt {
      margin-top: 0.4rem;
    }
  }
  @media (forced-colors: active) {
    .visibility input {
      appearance: auto;
    }
  }
</style>
