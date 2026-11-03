<script lang="ts">
  import JsonModeSwitch from './JsonModeSwitch.svelte';
  import JsonInput from './JsonInput.svelte';
  import ToolArgumentSample from './ToolArgumentSample.svelte';
  import ToolArgumentField from './ToolArgumentField.svelte';
  import {
    childPath,
    prepareArguments,
    readArguments,
    withField
  } from '$lib/testing/tool-arguments';

  let {
    schema,
    text = $bindable('{}'),
    disabled = false
  }: { schema: unknown; text?: string; disabled?: boolean } = $props();
  const id = $props.id();
  let jsonMode = $state(false);
  let prepared = $derived(prepareArguments(schema));
  let draft = $derived(readArguments(text, prepared.validate));
  let raw = $derived(jsonMode || !prepared.form || !draft.value);
  let entries = $derived(Object.entries(prepared.form?.properties ?? {}));
  let extra = $derived(
    Object.keys(draft.value ?? {}).filter(
      (key) => !Object.hasOwn(prepared.form?.properties ?? {}, key)
    )
  );

  export function canRun() {
    return draft.value !== undefined && draft.errors.length === 0;
  }
  export function argumentsForRun() {
    if (!draft.value || draft.errors.length)
      throw new Error('Correct the tool arguments before running.');
    return draft.value;
  }
</script>

<fieldset class="arguments" {disabled}>
  <legend>Tool arguments</legend>
  <div class="toolbar">
    <p>
      {raw
        ? 'Edit the argument object sent to the tool.'
        : 'Enter values for this test run.'}
    </p>
    <JsonModeSwitch
      checked={raw}
      disabled={!prepared.form || !draft.value}
      onchange={(next) => {
        jsonMode = next;
      }}
    />
  </div>
  {#if raw}
    {#if prepared.limitation}<p class="hint">
        JSON editor · {prepared.limitation}
      </p>{/if}
    {#if prepared.validate}
      {#key schema}<ToolArgumentSample {schema} bind:text />{/key}
    {/if}
    <label class="raw-label" for={id}>Arguments (JSON)</label>
    <JsonInput {id} bind:text invalid={!!draft.errors.length} />
  {:else if prepared.form}
    {#each entries as [key, field] (key)}
      <ToolArgumentField
        schema={field}
        name={key}
        path={childPath('', key)}
        value={draft.value && Object.hasOwn(draft.value, key)
          ? draft.value[key]
          : undefined}
        required={prepared.form.required?.includes(key)}
        errors={draft.errors}
        onchange={(next) =>
          (text = JSON.stringify(withField(draft.value, key, next), null, 2))}
      />
    {:else}
      <p class="hint">
        This tool declares no named fields.{prepared.form
          .additionalProperties !== false
          ? ' Use JSON to enter additional properties.'
          : ''}
      </p>
    {/each}
    {#if extra.length}<p class="hint">
        Additional properties are preserved. Edit them in JSON: {extra.join(
          ', '
        )}.
      </p>{/if}
  {/if}
  {#if draft.errors.length}
    <ul class="issues" aria-label="Argument validation">
      {#each draft.errors as issue}
        <li>
          {#if issue.path}<code>{issue.path}</code> ·
          {/if}{issue.message}
        </li>
      {/each}
    </ul>
  {/if}
</fieldset>

<style>
  .arguments {
    min-width: 0;
    margin: 1rem 0;
    padding: 0.85rem 1rem 1rem;
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  legend {
    padding: 0 0.3rem;
    color: var(--text);
    font-weight: 700;
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    margin-bottom: 0.9rem;
  }
  .toolbar p,
  .hint {
    margin: 0;
    color: var(--muted);
    font-size: 0.82rem;
    line-height: 1.5;
  }
  .raw-label {
    display: block;
    margin: 0.6rem 0 0.35rem;
    font-size: 0.85rem;
  }
  .issues {
    padding: 0.55rem 0.8rem 0.55rem 1.7rem;
    margin: 0.8rem 0 0;
    border-left: 2px solid var(--accent);
    color: var(--text);
    font-size: 0.8rem;
    overflow-wrap: anywhere;
  }
</style>
