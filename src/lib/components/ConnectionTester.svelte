<script lang="ts">
  import { promptArgumentsSchema } from '$lib/authoring/prompt-arguments';
  import NamedCases from './NamedCases.svelte';
  import McpResult from '$lib/components/McpResult.svelte';
  import ToolArguments from '$lib/components/ToolArguments.svelte';
  import { onDestroy, untrack } from 'svelte';
  import type { SourceCatalog } from '$lib/server/sources/contracts';
  type Kind = 'tool' | 'resource' | 'prompt';
  let {
    projectId,
    generation,
    sourceId,
    sourceKind,
    catalog,
    ready,
    initialKind,
    initialName,
    busy = $bindable(false)
  }: {
    projectId: string;
    generation: number;
    sourceId: string;
    sourceKind: 'bridge' | 'external';
    catalog?: SourceCatalog;
    ready: boolean;
    initialKind: string | null;
    initialName: string | null;
    busy?: boolean;
  } = $props();
  let kind = $state<Kind>(
    untrack(() =>
      initialKind === 'resource' || initialKind === 'prompt'
        ? initialKind
        : 'tool'
    )
  );
  let name = $state(untrack(() => initialName ?? ''));
  let args = $state('{}');
  let editor = $state<ReturnType<typeof ToolArguments>>();
  let selectedTool = $derived(
    catalog?.tools.find((tool) => tool.name === name)
  );
  let result = $state.raw<unknown>(undefined);
  let error = $state('');
  let pending: AbortController | undefined;
  const capabilities = $derived(
    (kind === 'tool'
      ? catalog?.tools
      : kind === 'resource'
        ? catalog?.resources
        : catalog?.prompts) ?? []
  );
  const promptFields = $derived(
    catalog?.prompts.find((p) => p.name === name)?.arguments ?? []
  );
  const selected = $derived(
    capabilities.some((c) => ('uri' in c ? c.uri : c.name) === name)
  );

  function clearInputs() {
    args = '{}';
    result = undefined;
    error = '';
  }
  onDestroy(() => pending?.abort());
  async function invoke() {
    if (busy || !ready || !selected) return;
    result = undefined;
    error = '';
    let values: unknown = {};
    if (kind === 'tool' || kind === 'prompt') {
      if (!editor?.canRun()) return;
      values = editor.argumentsForRun();
    }
    busy = true;
    pending = new AbortController();
    try {
      const response = await fetch(`/api/project/${sourceKind}`, {
        method: 'POST',
        signal: pending.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          generation,
          id: sourceId,
          action: 'invoke',
          original: true,
          kind,
          name,
          arguments: values
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      result = payload.result;
    } catch (failure) {
      if (!pending.signal.aborted)
        error = failure instanceof Error ? failure.message : String(failure);
    } finally {
      busy = false;
      pending = undefined;
    }
  }
</script>

<form
  class="glass-card workflow-form"
  onsubmit={(event) => {
    event.preventDefault();
    void invoke();
  }}
>
  <h2>
    Test {sourceKind === 'bridge' ? 'a bridged' : 'an external'} capability
  </h2>
  <label
    >Kind<select
      aria-label="Kind"
      disabled={busy}
      bind:value={kind}
      onchange={() => {
        name = '';
        clearInputs();
      }}
    >
      <option value="tool">Tool</option><option value="resource"
        >Resource</option
      ><option value="prompt">Prompt</option>
    </select></label
  >
  <label
    >Capability<select
      aria-label="Capability"
      disabled={busy}
      bind:value={name}
      onchange={clearInputs}
    >
      <option value="">Select a capability</option>
      {#each capabilities as item}<option
          value={'uri' in item ? String(item.uri) : item.name}
          >{item.name}</option
        >{/each}
    </select></label
  >
  {#if selectedTool && kind === 'tool'}
    {#key name}<ToolArguments
        bind:this={editor}
        schema={selectedTool.inputSchema}
        bind:text={args}
        disabled={busy}
      />{/key}
  {:else if selected && kind === 'prompt'}
    {#key name}<ToolArguments
        bind:this={editor}
        kind="prompt"
        schema={promptArgumentsSchema(promptFields)}
        bind:text={args}
        disabled={busy}
      />{/key}
  {/if}
  <button
    class="primary-button"
    disabled={busy ||
      !ready ||
      !selected ||
      (kind !== 'resource' && !editor?.canRun())}>Run request</button
  >
  {#if error}<p class="workflow-error" role="alert">{error}</p>{/if}
  {#if result !== undefined}{#key result}<McpResult
        {result}
        heading={`Result · ${name}`}
      />{/key}{/if}
</form>
{#if kind === 'tool' && selectedTool}{#key JSON.stringify( [projectId, sourceId, name] )}
    <NamedCases
      {projectId}
      {generation}
      source={sourceId}
      {sourceKind}
      tool={name}
      argumentsText={args}
      {result}
      disabled={busy || !ready}
    />
  {/key}{/if}
