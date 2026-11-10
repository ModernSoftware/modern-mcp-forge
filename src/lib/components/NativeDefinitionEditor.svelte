<script lang="ts">
  let { content, disabled, onChange } = $props<{
    content: string;
    disabled: boolean;
    onChange: (content: string) => void;
  }>();
  let category = $state<'tools' | 'resources' | 'prompts'>('tools');
  let name = $state('');
  let worker = $state('');
  let handler = $state('');
  let description = $state('');
  let uri = $state('');
  let schema = $state(
    '{\n  "type": "object",\n  "properties": {},\n  "additionalProperties": false\n}'
  );
  let promptArgs = $state('[]');
  let fields = $state<Array<{ name: string; type: string; required: boolean }>>(
    []
  );
  let mode = $state('json');
  let error = $state('');
  let manifest = $derived.by(() => {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  });

  function add() {
    error = '';
    try {
      if (!manifest || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(name))
        throw new Error(
          'Use a name starting with a letter, followed by letters, numbers, underscores or hyphens.'
        );
      if (!worker || !handler.trim())
        throw new Error('Select a worker and handler.');
      if (
        (manifest[category] ?? []).some(
          (item: { name: string }) => item.name === name
        )
      )
        throw new Error('This name already exists. Edit its definition below.');
      const definition: Record<string, unknown> = {
        name,
        worker,
        handler,
        description
      };
      if (category === 'tools') {
        if (mode === 'json') definition.inputSchema = JSON.parse(schema);
        else {
          const properties: Record<string, unknown> = {};
          const required: string[] = [];
          for (const field of fields) {
            if (!field.name || Object.hasOwn(properties, field.name))
              throw new Error('Field names must be nonempty and unique.');
            Object.defineProperty(properties, field.name, {
              value: { type: field.type },
              enumerable: true
            });
            if (field.required) required.push(field.name);
          }
          definition.inputSchema = {
            type: 'object',
            properties,
            required,
            additionalProperties: false
          };
        }
      } else if (category === 'resources') {
        definition.uri = uri;
        definition.mimeType = 'text/plain';
      } else definition.arguments = JSON.parse(promptArgs);
      const updated = structuredClone(manifest);
      updated[category] = [...(updated[category] ?? []), definition];
      onChange(JSON.stringify(updated, null, 2) + '\n');
      name = '';
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    }
  }
</script>

<details class="builder">
  <summary>Add a capability to this manifest</summary>
  <p>
    This edits the manifest draft. Implement the named handler in its worker
    module, then save. Edit existing definitions directly in the JSON editor.
  </p>
  {#if error}<p role="alert">{error}</p>{/if}
  <div class="fields">
    <label
      >Kind<select bind:value={category} {disabled}
        ><option value="tools">Tool</option><option value="resources"
          >Resource</option
        ><option value="prompts">Prompt</option></select
      ></label
    >
    <label>Name<input bind:value={name} {disabled} /></label>
    <label
      >Worker<select bind:value={worker} {disabled}
        ><option value="">Select worker</option
        >{#each Object.keys(manifest?.workers ?? {}) as id}<option value={id}
            >{id}</option
          >{/each}</select
      ></label
    >
    <label>Handler<input bind:value={handler} {disabled} /></label>
  </div>
  <label>Description<input bind:value={description} {disabled} /></label>
  {#if category === 'tools'}
    <label
      >Input schema mode<select bind:value={mode} {disabled}
        ><option value="json"
          >Full JSON Schema (nested objects and arrays)</option
        ><option value="fields">Simple fields</option></select
      ></label
    >
    {#if mode === 'json'}<label
        >Input schema<textarea rows="7" bind:value={schema} {disabled}
        ></textarea></label
      >
    {:else}
      {#each fields as field, index}<div class="fields">
          <input
            aria-label="Field name"
            bind:value={field.name}
            {disabled}
          /><select aria-label="Field type" bind:value={field.type} {disabled}
            ><option>string</option><option>number</option><option
              >boolean</option
            ></select
          ><label
            ><input
              type="checkbox"
              bind:checked={field.required}
              {disabled}
            />Required</label
          ><button
            {disabled}
            onclick={() => (fields = fields.filter((_, i) => i !== index))}
            >Remove</button
          >
        </div>{/each}
      <button
        {disabled}
        onclick={() =>
          (fields = [...fields, { name: '', type: 'string', required: false }])}
        >Add field</button
      >
    {/if}
  {:else if category === 'resources'}<label
      >Resource URI<input
        bind:value={uri}
        {disabled}
        placeholder="mcpack://support/guide"
      /></label
    >
  {:else}<label
      >Prompt arguments (JSON array)<textarea
        rows="4"
        bind:value={promptArgs}
        {disabled}
      ></textarea></label
    >{/if}
  <button disabled={disabled || !manifest} onclick={add}>Add to draft</button>
</details>

<style>
  .builder {
    margin: 16px 0;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  summary {
    cursor: pointer;
  }
  p {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .fields {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  label {
    display: grid;
    gap: 5px;
    margin: 10px 0;
    flex: 1;
    font-size: 0.8rem;
  }
  input,
  select,
  textarea,
  button {
    min-width: 0;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface-solid);
    color: var(--text);
  }
  textarea {
    font-family: monospace;
  }
  button {
    cursor: pointer;
  }
</style>
