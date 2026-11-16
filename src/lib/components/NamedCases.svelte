<script lang="ts">
  import { onDestroy } from 'svelte';
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
  type CaseRow = ReturnType<typeof listCases>['cases'][number];
  type Verdict = Awaited<ReturnType<typeof runCase>>;
  const sourceLabels = {
    native: 'Native',
    bridge: 'Bridged',
    external: 'External'
  };
  let search = $state('');
  let filterKind = $state('all');
  let filterSource = $state('all');
  let filterStatus = $state('all');
  let selected = $state(new Set<string>());
  let outcomes = $state<Record<string, Verdict & { error?: string }>>({});
  let activeId = $state('');
  let stopped = $state(false);
  let progress = $state<{
    total: number;
    completed: number;
    passed: number;
    failed: number;
    errors: number;
  } | null>(null);
  let disposed = false;
  onDestroy(() => {
    disposed = true;
    stopped = true;
  });
  let scoped = $derived(
    saved?.cases.filter(
      (c) =>
        !source ||
        (c.source === source &&
          c.sourceKind === sourceKind &&
          c.tool === tool)
    ) ?? []
  );
  function status(c: CaseRow) {
    if (c.id === activeId) return 'running';
    if (c.issue) return 'review';
    if (outcomes[c.id]?.error) return 'error';
    const passed = outcomes[c.id]?.passed ?? c.lastRun?.passed;
    return passed === undefined ? 'unrun' : passed ? 'passed' : 'failed';
  }
  let visible = $derived(
    scoped.filter(
      (c) =>
        (filterKind === 'all' || c.sourceKind === filterKind) &&
        (filterSource === 'all' || c.source === filterSource) &&
        (filterStatus === 'all' || status(c) === filterStatus) &&
        (c.name + ' ' + c.tool + ' ' + c.source)
          .toLowerCase()
          .includes(search.toLowerCase())
    )
  );
  let sourceOptions = $derived(
    [
      ...new Map(
        scoped
          .filter((c) => filterKind === 'all' || c.sourceKind === filterKind)
          .map((c) => [c.source, { id: c.source, kind: c.sourceKind }])
      ).values()
    ].sort((a, b) => a.id.localeCompare(b.id))
  );
  let runnable = $derived(visible.filter((c) => !c.issue));
  let queue = $derived(runnable.filter((c) => selected.has(c.id)));
  let allSelected = $derived(
    runnable.length > 0 && queue.length === runnable.length
  );
  let filterKey = $derived(
    'forge.cases.filters.v1.' + JSON.stringify([projectId, source, tool])
  );
  let loadedFilters = $state('');
  $effect(() => {
    try {
      const state = JSON.parse(sessionStorage.getItem(filterKey) ?? '{}');
      search = typeof state.search === 'string' ? state.search : '';
      filterKind = ['native', 'bridge', 'external'].includes(state.kind)
        ? state.kind
        : 'all';
      filterSource = typeof state.source === 'string' ? state.source : 'all';
      filterStatus = [
        'passed',
        'failed',
        'unrun',
        'review',
        'error'
      ].includes(state.status)
        ? state.status
        : 'all';
    } catch {
      /* The explorer also works with storage disabled. */
    }
    loadedFilters = filterKey;
  });
  $effect(() => {
    if (loadedFilters !== filterKey) return;
    try {
      sessionStorage.setItem(
        filterKey,
        JSON.stringify({
          search,
          kind: filterKind,
          source: filterSource,
          status: filterStatus
        })
      );
    } catch {
      /* Keep the current filters in memory. */
    }
  });
  function select(id: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    selected = next;
  }
  function selectVisible(checked: boolean) {
    const next = new Set(selected);
    for (const c of runnable) {
      if (checked) next.add(c.id);
      else next.delete(c.id);
    }
    selected = next;
  }
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
        if (!controller.signal.aborted) {
          saved = data;
          outcomes = {};
        }
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
      outcomes = {};
      message = 'Case saved to forge.cases.json.';
    });
  }
  async function runSelected() {
    if (working || disabled || !saved || !queue.length) return;
    const cases = [...queue];
    const context = { projectId, generation, revision: saved.revision };
    const live = cases.some((c) => c.expect.mode !== 'invalid-input');
    if (
      live &&
      !window.confirm(
        'Run ' +
          cases.length +
          ' selected ' +
          (cases.length === 1 ? 'case' : 'cases') +
          '? Tool calls use saved arguments and may change upstream data.'
      )
    )
      return;
    working = true;
    stopped = false;
    error = message = '';
    progress = {
      total: cases.length,
      completed: 0,
      passed: 0,
      failed: 0,
      errors: 0
    };
    for (const c of cases) {
      if (stopped || disposed) break;
      activeId = c.id;
      try {
        const verdict: Verdict = await post({
          action: 'run',
          ...context,
          id: c.id,
          confirmLive: live
        });
        outcomes = { ...outcomes, [c.id]: verdict };
        progress = {
          ...progress!,
          completed: progress!.completed + 1,
          passed: progress!.passed + Number(verdict.passed),
          failed: progress!.failed + Number(!verdict.passed)
        };
      } catch (failure) {
        const message =
          failure instanceof Error ? failure.message : String(failure);
        outcomes = {
          ...outcomes,
          [c.id]: { passed: false, problems: [], error: message }
        };
        progress = {
          ...progress!,
          completed: progress!.completed + 1,
          errors: progress!.errors + 1
        };
        error = message;
        stopped = true;
      } finally {
        activeId = '';
      }
    }
    try {
      if (!disposed)
        saved = await post({
          action: 'list',
          projectId: context.projectId,
          generation: context.generation
        });
    } catch (failure) {
      error ||= failure instanceof Error ? failure.message : String(failure);
    } finally {
      working = false;
    }
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
      const next = { ...outcomes };
      delete next[c.id];
      outcomes = next;
      select(c.id, false);
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
    <div class="case-filters">
      <label
        >Search cases<input
          bind:value={search}
          disabled={working}
          placeholder="Case, tool or source"
        /></label
      >
      {#if !source}
        <label
          >Source type<select
            aria-label="Source type"
            bind:value={filterKind}
            disabled={working}
            onchange={() => (filterSource = 'all')}
          >
            <option value="all">All types</option><option value="native"
              >Native</option
            ><option value="bridge">Bridged</option><option value="external"
              >External</option
            >
          </select></label
        >
        <label
          >Source<select aria-label="Source" bind:value={filterSource} disabled={working}
            ><option value="all">All sources</option>
            {#each sourceOptions as entry}<option value={entry.id}
                >{entry.id} · {sourceLabels[entry.kind]}</option
              >{/each}
          </select></label
        >
      {/if}
      <label
        >Result<select aria-label="Result" bind:value={filterStatus} disabled={working}>
          <option value="all">All results</option><option value="passed"
            >Passed</option
          ><option value="failed">Failed</option>
          <option value="unrun">Not run</option><option value="review"
            >Needs review</option
          ><option value="error">Run error</option>
        </select></label
      >
    </div>
    <div class="case-actions">
      <button
        type="button"
        class="primary-button"
        disabled={disabled || working || !queue.length}
        onclick={runSelected}>Run selected ({queue.length})</button
      >
      <button
        type="button"
        class="secondary-button"
        disabled={disabled || working || !runnable.length}
        onclick={() => selectVisible(true)}>Select all visible</button
      >
      <button
        type="button"
        class="secondary-button"
        disabled={working || !selected.size}
        onclick={() => (selected = new Set())}>Deselect all</button
      >
      {#if source}<button
          type="button"
          class="secondary-button"
          disabled={disabled || working || !saved}
          onclick={() => draft()}>Save as case</button
        >{/if}
      <button
        type="button"
        class="secondary-button"
        disabled={working}
        onclick={() =>
          perform(async () => {
            saved = await post({ action: 'list' });
            outcomes = {};
          })}>Refresh cases</button
      >
    </div>
    {#if progress}<div class="run-progress" role="status">
        <span
          >{working ? 'Running' : stopped ? 'Stopped' : 'Finished'} · {progress.completed}
          of {progress.total} cases · {progress.passed} passed · {progress.failed}
          failed{progress.errors
            ? ' · ' + progress.errors + ' run errors'
            : ''}</span
        >
        {#if working}<button
            type="button"
            class="secondary-button"
            disabled={stopped}
            onclick={() => (stopped = true)}
            >{stopped
              ? 'Stopping after current case…'
              : 'Stop after current case'}</button
          >{/if}
        <progress
          aria-label="Test run progress"
          value={progress.completed}
          max={progress.total}
        ></progress>
      </div>{/if}
    {#if error}<p class="workflow-error" role="alert">{error}</p>{/if}
    {#if message}<p role="status">{message}</p>{/if}
    <div class="case-list" role="group" aria-label="Test cases">
      <div class="case-list-heading">
        <input
          type="checkbox"
          aria-label="Select all visible cases"
          checked={allSelected}
          indeterminate={queue.length > 0 && !allSelected}
          disabled={disabled || working || !runnable.length}
          onchange={(e) => selectVisible(e.currentTarget.checked)}
        />
        <span
          >{visible.length} of {scoped.length} cases · {queue.length} visible selected</span
        >
      </div>
      {#each visible as c (c.id)}
        {@const state = status(c)}
        {@const verdict = outcomes[c.id]}
        <article
          class="case-row"
          class:case-selected={selected.has(c.id)}
          aria-label={c.name}
        >
          <input
            type="checkbox"
            aria-label={'Select ' + c.name}
            checked={selected.has(c.id)}
            disabled={disabled || working || !!c.issue}
            onchange={(e) => select(c.id, e.currentTarget.checked)}
          />
          <div class="case-info">
            <div class="case-title">
              <strong>{c.name}</strong><span
                class="case-status"
                data-status={state}
                >{state === 'review'
                  ? 'Needs review'
                  : state === 'unrun'
                    ? 'Not run'
                    : state === 'error'
                      ? 'Run error'
                      : state === 'running'
                        ? 'Running…'
                        : state === 'passed'
                          ? 'Passed'
                          : 'Failed'}</span
              >
            </div>
            <small
              >{sourceLabels[c.sourceKind]} · {c.source} · {c.tool}{c.lastRun
                ? ' · ' + new Date(c.lastRun.at).toLocaleString()
                : ''}</small
            >
            {#if c.issue}<p class="workflow-muted">{c.issue}</p>{/if}
            {#if verdict?.error}<p class="workflow-error">
                {verdict.error}
              </p>{/if}
            {#if verdict?.problems.length}<details class="case-diff">
                <summary
                  >Expected and actual ({verdict.problems.length})</summary
                >
                {#each verdict.problems as diff}<p>
                    <code>{diff.path || '(whole result)'}</code>
                  </p>
                  <pre>Expected {JSON.stringify(
                      diff.expected,
                      null,
                      2
                    )}{'\n'}Actual   {JSON.stringify(
                      diff.actual,
                      null,
                      2
                    )}</pre>{/each}
              </details>{/if}
          </div>
          <div class="row-actions">
            {#if source}<button
                type="button"
                class="secondary-button"
                disabled={disabled || working}
                onclick={() => draft(c)}>Review / edit</button
              >
            {:else if !c.issue.startsWith('Tool missing')}<a
                class="secondary-button"
                href={href(c)}>Open tester</a
              >{/if}
            <button
              type="button"
              class="secondary-button"
              disabled={working}
              onclick={() => remove(c)}>Delete case</button
            >
          </div>
        </article>
      {:else}{#if saved}
          <p class="empty-cases">
            {scoped.length
              ? 'No matching cases. Change your search or filters.'
              : 'No saved cases ' +
                (source ? 'for this tool.' : 'in this project.')}
          </p>{/if}
      {/each}
    </div>
    {#if editing && source}
      <div class="workflow-form case-editor">
        <h3>{id ? 'Edit case' : 'Save a named case'}</h3>
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
            Each assertion has a JSON Pointer and expected value. An empty
            path checks the entire result. An empty list checks only the
            outcome.
          </p>
          {#if result !== undefined}<label
              >Path in last result<input bind:value={path} /></label
            >
            <button type="button" class="secondary-button" onclick={capture}
              >Use value from last result</button
            >{/if}
        {/if}
        <div class="case-actions">
          <button
            class="primary-button"
            type="button"
            disabled={disabled || working || !name.trim()}
            onclick={save}>Save case</button
          >
          <button
            class="secondary-button"
            type="button"
            disabled={working}
            onclick={() => (editing = false)}>Cancel</button
          >
        </div>
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
    overflow: hidden;
  }
  .named-cases > summary {
    cursor: pointer;
    font-weight: 800;
    padding: 1rem 1.2rem;
    background: var(--surface-solid);
  }
  .named-cases .case-panel {
    padding: 1rem;
  }
  .case-panel {
    overflow-wrap: anywhere;
  }
  .case-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin: 1rem 0;
  }
  .case-filters label {
    display: grid;
    gap: 0.4rem;
    font-size: 0.85rem;
    flex: 1;
    min-width: 8rem;
  }
  .case-filters label:first-child {
    flex: 2;
    min-width: 12rem;
  }
  .case-filters input,
  .case-filters select {
    width: 100%;
    min-width: 0;
    padding: 0.65rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-solid);
    color: var(--text);
  }
  .case-actions,
  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    margin: 0.8rem 0;
  }
  .case-actions button,
  .row-actions :is(button, a) {
    font-size: 0.8rem;
  }
  .row-actions {
    margin: 0;
    justify-content: flex-end;
  }
  .case-list {
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }
  .case-list-heading {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    background: var(--surface-solid);
    padding: 0.8rem 1rem;
    font-size: 0.82rem;
    color: var(--muted);
  }
  .case-row {
    display: grid;
    grid-template-columns: 1rem minmax(0, 1fr) auto;
    gap: 0.8rem;
    align-items: center;
    border-top: 1px solid var(--border);
    padding: 1rem;
  }
  .case-selected {
    background: var(--accent-soft);
  }
  .case-list input[type='checkbox'] {
    margin: 0;
    padding: 0;
    width: 1rem;
    height: 1rem;
    accent-color: var(--accent);
  }
  .case-info {
    min-width: 0;
  }
  .case-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.65rem;
    margin-bottom: 0.3rem;
  }
  .case-status {
    padding: 0.15rem 0.5rem;
    border-radius: 6px;
    background: var(--surface-solid);
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 800;
  }
  .case-status[data-status='passed'] {
    color: var(--success);
  }
  .case-status[data-status='failed'],
  .case-status[data-status='error'] {
    color: var(--danger);
  }
  .case-status[data-status='running'] {
    color: var(--accent);
  }
  .case-status[data-status='review'] {
    color: var(--warning);
  }
  .case-info small {
    color: var(--muted);
  }
  .case-info p {
    margin: 0.4rem 0 0;
  }
  .case-diff {
    margin-top: 0.6rem;
  }
  .case-diff summary {
    cursor: pointer;
  }
  .case-editor {
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
  }
  .case-editor h3 {
    margin-top: 0;
  }
  .case-editor :is(input, textarea, select) {
    min-width: 0;
    width: 100%;
  }
  .run-progress {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    padding: 0.75rem 0;
  }
  .run-progress progress {
    width: 100%;
    height: 0.5rem;
    accent-color: var(--accent);
  }
  .empty-cases {
    padding: 1rem;
    color: var(--muted);
  }
  pre {
    white-space: pre-wrap;
    max-height: 20rem;
    overflow: auto;
  }
  @media (max-width: 700px) {
    .case-row {
      grid-template-columns: 1rem minmax(0, 1fr);
    }
    .row-actions {
      grid-column: 2;
      justify-content: flex-start;
    }
  }
</style>
