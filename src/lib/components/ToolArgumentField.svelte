<script lang="ts">
  import ToolArgumentField from './ToolArgumentField.svelte';
  import {
    childPath,
    isObject,
    newItem,
    withField,
    type FieldSchema
  } from '$lib/testing/tool-arguments';

  let {
    schema,
    name,
    path,
    value,
    required = false,
    errors,
    onchange
  }: {
    schema: FieldSchema;
    name: string;
    path: string;
    value: unknown;
    required?: boolean;
    errors: { path: string; message: string }[];
    onchange: (next: unknown) => void;
  } = $props();
  const id = $props.id();
  let error = $derived(errors.find((e) => e.path === path)?.message);
  let entries = $derived(Object.entries(schema.properties ?? {}));
  let object = $derived(isObject(value) ? value : {});
  let extra = $derived(
    Object.keys(object).filter(
      (key) => !Object.hasOwn(schema.properties ?? {}, key)
    )
  );
  let items = $derived(Array.isArray(value) ? value : []);
  let title = $derived(schema.title || name);
  let choices = $derived(
    schema.enum ?? (schema.type === 'boolean' ? [true, false] : null)
  );
  let hint = $derived(
    [
      schema.description,
      schema.minimum !== undefined ? 'Minimum ' + schema.minimum + '.' : '',
      schema.maximum !== undefined ? 'Maximum ' + schema.maximum + '.' : '',
      schema.exclusiveMinimum !== undefined
        ? 'Greater than ' + schema.exclusiveMinimum + '.'
        : '',
      schema.exclusiveMaximum !== undefined
        ? 'Less than ' + schema.exclusiveMaximum + '.'
        : ''
    ]
      .filter(Boolean)
      .join(' ')
  );
</script>

{#snippet caption()}
  <strong>{title}</strong>
  {#if schema.title && schema.title !== name}<code>{name}</code>{/if}
  <small>{schema.type} · {required ? 'required' : 'optional'}</small>
{/snippet}

{#snippet reset()}
  {#if !required && value !== undefined}
    <button
      class="minor"
      type="button"
      aria-label={'Omit ' + title}
      onclick={() => onchange(undefined)}>Omit</button
    >
  {/if}
{/snippet}

{#if schema.type === 'object' || schema.type === 'array'}
  <fieldset class="collection">
    <legend>{@render caption()}</legend>
    {#if hint}<p class="hint">{hint}</p>{/if}
    {#if schema.type === 'object'}
      {#if value !== undefined || required}
        {#each entries as [key, field] (key)}
          <ToolArgumentField
            schema={field}
            name={key}
            path={childPath(path, key)}
            value={Object.hasOwn(object, key) ? object[key] : undefined}
            required={schema.required?.includes(key)}
            {errors}
            onchange={(next) => onchange(withField(object, key, next))}
          />
        {/each}
        {#if extra.length}<p class="hint">
            Edit additional properties in JSON: {extra.join(', ')}.
          </p>{/if}
      {/if}
      {#if value === undefined}
        <button class="minor" type="button" onclick={() => onchange({})}
          >Include {title}</button
        >
      {/if}
    {:else if schema.items}
      {#each items as item, index}
        <div class="item">
          <ToolArgumentField
            schema={schema.items}
            name={'Item ' + (index + 1)}
            path={childPath(path, String(index))}
            value={item}
            required
            {errors}
            onchange={(next) =>
              onchange(items.map((v, i) => (i === index ? (next ?? null) : v)))}
          />
          <button
            class="minor"
            type="button"
            aria-label={'Remove ' + title + ' item ' + (index + 1)}
            onclick={() => onchange(items.filter((_, i) => i !== index))}
            >Remove item</button
          >
        </div>
      {/each}
      <button
        class="minor"
        type="button"
        disabled={schema.maxItems !== undefined &&
          items.length >= schema.maxItems}
        onclick={() => onchange([...items, newItem(schema.items!)])}
        >Add item to {title}</button
      >
      {#if value === undefined && !schema.minItems}<button
          class="minor"
          type="button"
          onclick={() => onchange([])}>Use empty list</button
        >{/if}
    {/if}
    {@render reset()}
  </fieldset>
{:else}
  <div class="field">
    <div class="heading">
      <label for={id}>{@render caption()}</label>{@render reset()}
    </div>
    {#if choices}
      <select
        {id}
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={id + '-help'}
        value={choices.findIndex((choice) => choice === value)}
        onchange={(e) => onchange(choices?.[Number(e.currentTarget.value)])}
      >
        <option value={-1}>{required ? 'Select a value' : 'Not set'}</option>
        {#each choices as choice, i}<option value={i}
            >{typeof choice === 'string' && !choice
              ? 'Empty string'
              : String(choice)}</option
          >{/each}
      </select>
    {:else if schema.type === 'number' || schema.type === 'integer'}
      <input
        {id}
        type="number"
        step={schema.type === 'integer' ? '1' : 'any'}
        min={schema.minimum}
        max={schema.maximum}
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={id + '-help'}
        value={typeof value === 'number' ? value : ''}
        oninput={(e) => {
          const input = e.currentTarget;
          onchange(
            input.validity.badInput
              ? ''
              : input.value === ''
                ? undefined
                : input.valueAsNumber
          );
        }}
      />
    {:else if typeof value === 'string' && /[\r\n]/.test(value)}
      <textarea
        {id}
        rows="3"
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={id + '-help'}
        {value}
        oninput={(e) => onchange(e.currentTarget.value)}></textarea>
    {:else}
      <input
        {id}
        type="text"
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={id + '-help'}
        value={typeof value === 'string' ? value : ''}
        oninput={(e) => onchange(e.currentTarget.value)}
      />
    {/if}
    <span class="hint" id={id + '-help'}
      >{hint}{#if error && error !== 'Required.'}
        <span class="error">{error}</span>{/if}</span
    >
  </div>
{/if}

<style>
  .heading,
  label,
  legend {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.45rem;
  }
  .heading {
    justify-content: space-between;
  }
  label,
  legend {
    color: var(--text);
    overflow-wrap: anywhere;
  }
  strong {
    font-size: 0.88rem;
  }
  small,
  .hint {
    color: var(--muted);
    font-size: 0.78rem;
    line-height: 1.5;
  }
  .field {
    display: grid;
    gap: 0.35rem;
    margin: 0.75rem 0;
  }
  input,
  select,
  textarea {
    width: 100%;
    min-width: 0;
    padding: 0.62rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    background: var(--surface-solid);
    font: inherit;
  }
  .minor {
    color: var(--accent);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.3rem 0.6rem;
    cursor: pointer;
    font: inherit;
    font-size: 0.78rem;
  }
  .minor:disabled {
    opacity: 0.55;
  }
  .collection {
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.65rem 0.85rem;
    margin: 0.55rem 0;
  }
  .item {
    padding: 0.25rem 0 0.65rem;
    margin-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }
  .hint:empty {
    display: none;
  }
  .error {
    color: var(--danger);
  }
</style>
