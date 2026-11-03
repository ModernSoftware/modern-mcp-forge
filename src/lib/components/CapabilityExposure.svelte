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

<details bind:open>
  <summary>Agent exposure · {publicName ?? 'Hidden'}</summary>
  {#if open}
    <div class="workflow-form">
      <p>Upstream identity <code>{identity}</code></p>
      <label
        ><input type="checkbox" bind:checked={visible} disabled={busy} /> Expose to
        agents</label
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
      <button
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
          type="button"
          disabled={busy}
          onclick={() => save({ kind, identity })}
          >Restore upstream defaults</button
        >{/if}
    </div>
  {/if}
</details>
