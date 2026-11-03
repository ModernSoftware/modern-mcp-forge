<script lang="ts">
  import { atPointer, type ToolCase } from '$lib/testing/named-case';
  import type { listCases, runCase } from '$lib/server/sources/named-cases';
  let {
    projectId,
    generation,
    source,
    sourceKind,
    tool,
    argumentsText = '{}',
    result,
    disabled = false
  }: {
    projectId: string;
    generation: number;
    source?: string;
    sourceKind?: ToolCase['sourceKind'];
    tool?: string;
    argumentsText?: string;
    result?: unknown;
    disabled?: boolean;
  } = $props();
  let open = $state(false),
    working = $state(false),
    editing = $state(false);
  let saved = $state.raw<ReturnType<typeof listCases>>();
  let visible = $derived(
    saved?.cases.filter(
      (c) =>
        !source ||
        (c.source === source && c.sourceKind === sourceKind && c.tool === tool)
    ) ?? []
  );
  let message = $state(''),
    error = $state(''),
    id = $state(''),
    name = $state(''),
    args = $state('{}');
  let draftRevision = '',
    draftGeneration = 0;
  let mode = $state<ToolCase['expect']['mode']>('success');
  let fields = $state('[]'),
    path = $state('');
  let verdict = $state.raw<Awaited<ReturnType<typeof runCase>>>();
  let verdictName = $state('');
  async function post(body: object, signal?: AbortSignal) {
    const r = await fetch('/api/project/cases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, generation, ...body }),
      signal
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? 'Case request failed.');
    return data;
  }
  $effect(() => {
    if (!open && source) return;
    // Track the source generation even if the current selection stays mounted.
    const controller = new AbortController();
    post({ action: 'list' }, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) saved = data;
      })
      .catch((e) => {
        if (!controller.signal.aborted) error = e.message;
      });
    return () => controller.abort();
  });
  async function perform(fn: () => Promise<void>) {
    if (working) return;
    working = true;
    error = '';
    message = '';
    try {
      await fn();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      working = false;
    }
  }
  function draft(c?: ToolCase) {
    draftRevision = saved?.revision ?? '';
    draftGeneration = generation;
    id = c?.id ?? '';
    name = c?.name ?? '';
    args = c ? JSON.stringify(c.arguments, null, 2) : argumentsText;
    mode =
      c?.expect.mode ??
      (atPointer(result, '/isError') === true ? 'tool-error' : 'success');
    path =
      c?.expect.mode === 'invalid-input'
        ? c.expect.path
        : result && atPointer(result, '/structuredContent') !== undefined
          ? '/structuredContent'
          : '/content';
    fields = JSON.stringify(
      c && c.expect.mode !== 'invalid-input' ? c.expect.fields : [],
      null,
      2
    );
    editing = true;
    error = '';
    message = '';
  }
  function capture() {
    try {
      const value = atPointer(result, path);
      if (value === undefined)
        throw new Error('That path is missing from the last tool result.');
      const checks = JSON.parse(fields);
      if (!Array.isArray(checks))
        throw new Error('Expected fields must be a JSON array.');
      fields = JSON.stringify(
        [...checks.filter((f) => f.path !== path), { path, value }],
        null,
        2
      );
      error = '';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  function save() {
    return perform(async () => {
      const definition = {
        source,
        sourceKind,
        tool,
        name,
        arguments: JSON.parse(args),
        expect:
          mode === 'invalid-input'
            ? { mode, path }
            : { mode, fields: JSON.parse(fields) }
      };
      saved = await post({
        action: 'save',
        revision: draftRevision,
        generation: draftGeneration,
        ...(id && { id }),
        definition
      });
      editing = false;
      message = 'Case saved to forge.cases.json.';
    });
  }
  function run(c: ToolCase) {
    const confirmLive =
      c.expect.mode !== 'invalid-input' &&
      window.confirm(
        'Run “' +
          c.name +
          '” now? This calls the saved tool with its saved arguments and can change upstream data.'
      );
    if (c.expect.mode !== 'invalid-input' && !confirmLive) return;
    return perform(async () => {
      verdict = undefined;
      verdict = await post({
        action: 'run',
        id: c.id,
        revision: saved?.revision,
        confirmLive
      });
      verdictName = c.name;
      saved = await post({ action: 'list' });
    });
  }
  function remove(c: ToolCase) {
    if (!window.confirm('Delete “' + c.name + '” from this project?')) return;
    return perform(async () => {
      saved = await post({
        action: 'remove',
        id: c.id,
        revision: saved?.revision
      });
      editing = false;
      verdict = undefined;
      message = 'Case deleted.';
    });
  }
  function href(c: ToolCase) {
    return c.sourceKind === 'native'
      ? '/workspace/native/' +
          encodeURIComponent(c.source) +
          '/tools/' +
          encodeURIComponent(c.tool) +
          '?tab=test'
      : '/project/' +
          c.sourceKind +
          '/' +
          encodeURIComponent(c.source) +
          '?' +
          new URLSearchParams({ kind: 'tool', upstream: c.tool });
  }
</script>

{#snippet panel()}
  <div class="case-panel">
    <p>
      Cases save example arguments and assertions in <code
        >forge.cases.json</code
      >. Use fixture data that is safe to commit. Each run is explicit.
    </p>
    <div class="workflow-toolbar">
      {#if source}<button
          type="button"
          class="secondary-button"
          disabled={disabled || working || !saved}
          onclick={() => draft()}>Save as case</button
        >{/if}
      <button
        type="button"
        disabled={working}
        onclick={() =>
          perform(async () => {
            saved = await post({ action: 'list' });
          })}>Refresh cases</button
      >
    </div>
    {#if error}<p class="workflow-error" role="alert">{error}</p>{/if}
    {#if message}<p role="status">{message}</p>{/if}
    {#each visible as c (c.id)}
      <article class="case-row">
        <strong>{c.name}</strong> <small>{c.source} · {c.tool}</small>
        <p>
          {c.issue ||
            (c.lastRun
              ? (c.lastRun.passed ? 'Passed' : 'Failed') +
                ' · ' +
                new Date(c.lastRun.at).toLocaleString()
              : 'No run for this version')}
        </p>
        <div class="workflow-toolbar">
          <button
            type="button"
            disabled={disabled || working || !!c.issue}
            onclick={() => run(c)}>Run case</button
          >
          {#if source}<button
              type="button"
              disabled={disabled || working}
              onclick={() => draft(c)}>Review / edit</button
            >
          {:else if !c.issue.startsWith('Tool missing')}<a href={href(c)}
              >Open tester</a
            >{/if}
          <button type="button" disabled={working} onclick={() => remove(c)}
            >Delete case</button
          >
        </div>
      </article>
    {:else}{#if saved}<p>
          No saved cases {source ? 'for this tool' : 'in this project'}.
        </p>{/if}{/each}
    {#if verdict}<div role="status">
        <strong>{verdictName} · {verdict.passed ? 'Passed' : 'Failed'}</strong>
        {#each verdict.problems as diff}<p>
            <code>{diff.path || '(whole result)'}</code>
          </p>
          <pre>Expected {JSON.stringify(
              diff.expected,
              null,
              2
            )}{'\n'}Actual   {JSON.stringify(diff.actual, null, 2)}</pre>{/each}
      </div>{/if}
    {#if editing && source}
      <div class="workflow-form">
        <label>Case name<input bind:value={name} maxlength="120" /></label>
        <label
          >Saved arguments (JSON)<textarea bind:value={args} rows="5"
          ></textarea></label
        >
        <label
          >Expected outcome<select bind:value={mode}
            ><option value="success">Successful tool result</option><option
              value="tool-error">MCP tool error</option
            ><option value="invalid-input"
              >Input rejected before dispatch</option
            ></select
          ></label
        >
        {#if mode === 'invalid-input'}<label
            >Expected validation path<input
              bind:value={path}
              placeholder="/quantity"
            /></label
          >
        {:else}
          <label
            >Expected fields (JSON)<textarea bind:value={fields} rows="5"
            ></textarea></label
          >
          <p>
            Each assertion has a JSON Pointer and expected value. An empty path
            checks the entire result. An empty list checks only the outcome.
          </p>
          {#if result !== undefined}<label
              >Path in last result<input bind:value={path} /></label
            >
            <button type="button" onclick={capture}
              >Use value from last result</button
            >{/if}
        {/if}
        <button
          type="button"
          disabled={disabled || working || !name.trim()}
          onclick={save}>Save case</button
        >
        <button
          type="button"
          disabled={working}
          onclick={() => (editing = false)}>Cancel</button
        >
      </div>
    {/if}
  </div>
{/snippet}
{#if source}
  <details class="glass-card named-cases" bind:open>
    <summary>Named test cases</summary>{#if open}{@render panel()}{/if}
  </details>
{:else}{@render panel()}{/if}

<style>
  .named-cases {
    margin-block: 1rem;
    padding: 1rem;
  }
  summary {
    cursor: pointer;
    font-weight: 700;
  }
  .case-panel {
    overflow-wrap: anywhere;
  }
  .case-row {
    border-top: 1px solid var(--border);
    padding: 0.8rem 0;
  }
  .case-row small {
    color: var(--muted);
  }
  pre {
    white-space: pre-wrap;
    max-height: 20rem;
    overflow: auto;
  }
</style>
