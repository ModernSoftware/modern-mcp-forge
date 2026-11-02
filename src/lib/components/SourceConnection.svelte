<script lang="ts">
  import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
  import {
    canLeaveProject,
    registerProjectLeaveGuard
  } from '$lib/navigation/project-leave';
  import type { ProjectSource } from '$lib/server/sources/schema';
  import { onMount, untrack } from 'svelte';
  let {
    projectId,
    generation,
    kind = 'external',
    source
  } = $props<{
    projectId: string;
    generation: number;
    kind?: 'bridge' | 'external';
    source?: Exclude<ProjectSource, { kind: 'native' }>;
  }>();
  let id = $state(untrack(() => source?.id ?? ''));
  let url = $state(
    untrack(() => (source?.kind === 'external' ? source.url : ''))
  );
  let auth = $state(
    untrack(() =>
      source?.kind === 'external' && source.bearerTokenEnv ? 'bearer' : 'none'
    )
  );
  let naming = $state<'always' | 'collisions'>(
    untrack(() =>
      source
        ? (source.naming ?? (kind === 'bridge' ? 'collisions' : 'always'))
        : 'collisions'
    )
  );
  let tokenEnv = $state(
    untrack(() =>
      source?.kind === 'external' ? (source.bearerTokenEnv ?? '') : ''
    )
  );
  let runtime = $state<'node' | 'python'>(
    untrack(() => (source?.kind === 'bridge' ? source.runtime : 'node'))
  );
  let mode = $state<'adapter' | 'stdio'>(
    untrack(() =>
      source?.kind === 'bridge' ? (source.mode ?? 'stdio') : 'adapter'
    )
  );
  let checkoutEnv = $state(
    untrack(() => (source?.kind === 'bridge' ? (source.checkoutEnv ?? '') : ''))
  );
  let startOnSave = $state(true);
  let entrypoint = $state(
    untrack(() => (source?.kind === 'bridge' ? source.entrypoint : ''))
  );
  let adapterFileMode = $state<'create' | 'existing'>(
    untrack(() => (source ? 'existing' : 'create'))
  );
  let location = $state<'project' | 'checkout'>(
    untrack(() =>
      source?.kind === 'bridge' && source.checkoutEnv ? 'checkout' : 'project'
    )
  );
  let generatedPath = $state('');
  let plannedPath = $derived(
    id ? `bridges/${id}/adapter.${runtime === 'node' ? 'mjs' : 'py'}` : ''
  );
  let generatingFile = $derived(
    kind === 'bridge' &&
      mode === 'adapter' &&
      adapterFileMode === 'create' &&
      !source
  );
  let fileReady = $derived(
    !generatingFile || Boolean(plannedPath && generatedPath === plannedPath)
  );
  let cwd = $state(
    untrack(() => (source?.kind === 'bridge' ? (source.cwd ?? '') : ''))
  );
  let envNames = $state<string>(
    untrack(() =>
      source?.kind === 'bridge' ? (source.inheritEnv ?? []).join(', ') : ''
    )
  );
  let argv = $state(
    untrack(() =>
      source?.kind === 'bridge' ? JSON.stringify(source.args ?? []) : '[]'
    )
  );
  let starterNotice = $state('');
  function values() {
    return JSON.stringify(
      kind === 'bridge'
        ? [
            id,
            naming,
            runtime,
            mode,
            adapterFileMode,
            location,
            mode === 'adapter' && location === 'checkout' ? checkoutEnv : '',
            entrypoint,
            cwd,
            envNames,
            argv,
            startOnSave
          ]
        : [id, url, naming, auth, auth === 'bearer' ? tokenEnv : '']
    );
  }
  let baseline = $state(untrack(values));
  let dirty = $derived(values() !== baseline);
  let busy = $state(false);
  let error = $state('');
  let pending: AbortController | undefined;
  let leaving = false;
  let committing = $state(false);
  async function cancel() {
    leaving = true;
    pending?.abort();
    await goto('/workspace', { invalidateAll: true });
  }
  onMount(() =>
    registerProjectLeaveGuard(
      () =>
        leaving ||
        (!busy &&
          (!dirty || window.confirm('Discard unsaved connection changes?')))
    )
  );
  beforeNavigate((navigation) => {
    if (!canLeaveProject()) navigation.cancel();
  });
  async function scaffold() {
    if (busy) return;
    busy = true;
    error = '';
    starterNotice = '';
    try {
      const response = await fetch('/api/project/bridge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          generation,
          action: 'scaffold',
          id,
          runtime
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      entrypoint = generatedPath = payload.entrypoint;
      starterNotice = `Created ${entrypoint}. Wire its hooks in your editor, then save the connection. You can also save it disabled and wire it later.`;
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    } finally {
      busy = false;
    }
  }
  async function save() {
    if (busy || !fileReady) return;
    busy = true;
    error = '';
    let navigate = false;
    pending = new AbortController();
    try {
      let args: unknown = [];
      if (kind === 'bridge') {
        try {
          args = JSON.parse(argv || '[]');
        } catch {
          throw new Error(
            'Enter script arguments as a valid JSON array of strings.'
          );
        }
      }
      if (
        !Array.isArray(args) ||
        args.some((value) => typeof value !== 'string')
      )
        throw new Error('Enter script arguments as a JSON array of strings.');
      const response = await fetch(`/api/project/${kind}`, {
        method: 'POST',
        signal: pending.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          generation,
          action: 'preview',
          operation: source ? 'update' : 'create',
          source:
            kind === 'bridge'
              ? {
                  id,
                  kind,
                  naming,
                  enabled: source?.enabled ?? (mode === 'stdio' || startOnSave),
                  runtime,
                  mode,
                  ...(mode === 'adapter' &&
                    location === 'checkout' &&
                    checkoutEnv.trim() && { checkoutEnv: checkoutEnv.trim() }),
                  entrypoint: generatingFile
                    ? generatedPath
                    : entrypoint.trim(),
                  ...(cwd.trim() && { cwd: cwd.trim() }),
                  ...(envNames.trim() && {
                    inheritEnv: envNames
                      .split(',')
                      .map((key) => key.trim())
                      .filter(Boolean)
                  }),
                  args
                }
              : {
                  id,
                  kind,
                  naming,
                  enabled: source?.enabled ?? true,
                  url,
                  ...(auth === 'bearer'
                    ? { bearerTokenEnv: tokenEnv.trim() }
                    : {})
                }
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      if (leaving) return;
      committing = true;
      const saved = await fetch(`/api/project/${kind}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          generation,
          action: 'commit',
          ticket: payload.ticket
        })
      });
      if (!saved.ok) throw new Error((await saved.json()).error);
      baseline = values();
      navigate = true;
    } catch (failure) {
      if (!leaving)
        error = failure instanceof Error ? failure.message : String(failure);
    } finally {
      busy = false;
      pending = undefined;
      committing = false;
      if (!leaving) await invalidateAll();
    }
    if (navigate && !leaving)
      await goto(`/project/${kind}/${encodeURIComponent(id)}`, {
        invalidateAll: true
      });
  }
</script>

<svelte:window
  onbeforeunload={(event) => {
    if (dirty && !leaving) {
      event.preventDefault();
      event.returnValue = '';
    }
  }}
/>
<form
  class="glass-card workflow-form"
  onsubmit={(event) => {
    event.preventDefault();
    void save();
  }}
>
  {#if error}<p role="alert" class="workflow-error">{error}</p>{/if}
  <label
    >{kind === 'bridge' ? 'Bridge name' : 'Connection name'}<input
      bind:value={id}
      required
      disabled={busy || Boolean(source)}
      maxlength="64"
      pattern="[A-Za-z][A-Za-z0-9_\-]*"
      title="Start with a letter, then use letters, numbers, underscores or hyphens."
      placeholder="support"
    /></label
  >
  <label
    >Published names<select
      aria-label="Published names"
      bind:value={naming}
      disabled={busy}
    >
      <option value="collisions">Prefix only colliding names</option>
      <option value="always">Always prefix with connection name</option>
    </select></label
  >
  <p class="workflow-muted">
    Applies to tools, resources and prompts. Resource URIs always identify their
    connection. Reconnect agents after changing published names.
  </p>
  {#if kind === 'bridge'}
    <label
      >Connection method<select
        aria-label="Connection method"
        bind:value={mode}
        disabled={busy}
      >
        <option value="adapter">Wire an existing implementation</option>
        <option value="stdio">Launch an existing stdio server</option>
      </select></label
    >
    <label
      >Runtime<select aria-label="Runtime" bind:value={runtime} disabled={busy}
        ><option value="node">Node.js</option><option value="python"
          >Python</option
        ></select
      ></label
    >
    {#if mode === 'adapter' && !source}
      <label
        >Adapter setup<select
          disabled={busy}
          bind:value={adapterFileMode}
          aria-label="Adapter setup"
        >
          <option value="create">Create an adapter file</option><option
            value="existing">Use an existing adapter file</option
          >
        </select></label
      >
    {/if}
    {#if generatingFile}
      <div class="scaffold">
        <strong>Generated adapter path</strong>
        <code>{plannedPath || 'Enter a bridge name to preview its path.'}</code>
        <button
          type="button"
          class="secondary-button"
          disabled={busy ||
            !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id) ||
            fileReady}
          onclick={scaffold}
        >
          {fileReady ? 'Adapter file created' : 'Create adapter file'}
        </button>
      </div>
      {#if fileReady && starterNotice}<p role="status">{starterNotice}</p>{/if}
    {:else}
      <label
        >{mode === 'adapter' ? 'Adapter file' : 'Stdio entrypoint'}<input
          bind:value={entrypoint}
          required
          disabled={busy}
          placeholder="Project-relative file path"
        /></label
      >
    {/if}
    {#if mode === 'adapter'}
      <p class="workflow-muted">
        The adapter stays in this Forge project. Edit its hooks to expose your
        application's tools, resources and prompts.
      </p>
      <label
        >Application location<select
          aria-label="Application location"
          disabled={busy}
          bind:value={location}
        >
          <option value="project">Inside this Forge project</option><option
            value="checkout">In a separate checkout</option
          >
        </select></label
      >
      {#if location === 'checkout'}
        <label
          >Application checkout variable<input
            aria-label="Application checkout variable"
            required
            bind:value={checkoutEnv}
            disabled={busy}
            placeholder="ORDERS_CHECKOUT"
            pattern="[A-Za-z_][A-Za-z0-9_]*"
          /></label
        >
        <p class="workflow-muted">
          Enter the variable name, such as ORDERS_CHECKOUT. Set its value to the
          application's absolute folder on the machine running Forge. The
          project stores only the name.
        </p>
      {/if}
      {#if runtime === 'python'}<p class="workflow-muted">
          The Forge Python host uses the mcp dependency listed in
          requirements-forge.txt. Use the adapter’s .venv or the application’s
          Python environment.
        </p>{/if}
      {#if !source}
        <label class="start-choice"
          ><input
            type="checkbox"
            bind:checked={startOnSave}
            disabled={busy}
          />Start and discover on save</label
        >
        <p class="workflow-muted">
          Clear this to save a disabled bridge while you wire the adapter. You
          can enable it later from the workspace.
        </p>
      {/if}
    {:else}
      <p class="workflow-muted">
        Select a project-relative script that already serves MCP over stdio.
      </p>
    {/if}
    <details class="launch-settings">
      <summary>Launch settings</summary>
      <div class="launch-fields">
        <label
          >Working directory<input
            bind:value={cwd}
            disabled={busy}
            placeholder={mode === 'adapter'
              ? 'Defaults to the application root'
              : 'Defaults to the entrypoint folder'}
          /></label
        >
        <label
          >Environment variable names<input
            bind:value={envNames}
            disabled={busy}
            placeholder="API_KEY, MODEL_NAME"
          /></label
        >
        <p class="workflow-muted">
          Enter names only. Forge reads their values from its own environment
          when it launches the bridge.
        </p>
        <label
          >Script arguments (JSON array)<textarea
            rows="4"
            spellcheck="false"
            bind:value={argv}
            disabled={busy}></textarea></label
        >
        <small class="workflow-muted"
          >Each string is one argument, for example <code
            >{'["--profile", "development"]'}</code
          >.</small
        >
      </div>
    </details>
    <p class="workflow-notice">
      Attaching or enabling a bridge starts trusted local code with your user
      permissions. Use stderr for logs and reserve stdout for MCP messages.
    </p>
  {:else}
    <label
      >Streamable HTTP MCP URL<input
        type="url"
        bind:value={url}
        required
        disabled={busy}
        placeholder="https://example.com/mcp"
      /></label
    >
    <label
      >Authentication<select bind:value={auth} disabled={busy}>
        <option value="none">No authentication</option>
        <option value="bearer">Bearer token</option>
      </select></label
    >
    {#if auth === 'bearer'}
      <label
        >Token environment variable<input
          bind:value={tokenEnv}
          disabled={busy}
          required
          pattern="[A-Za-z_][A-Za-z0-9_]*"
          placeholder="EXAMPLE_MCP_TOKEN"
        /></label
      >
      <p class="workflow-muted">
        Enter only the variable name. In the terminal that starts Forge, set
        that variable to the access token issued for this server. Restart Forge
        after changing the value.
      </p>
    {/if}
    <p class="workflow-notice">
      Connect only servers you trust. Forge sends this source's configured
      credential and test arguments to it. Tools may perform real actions; Forge
      does not retry failed calls.
    </p>
  {/if}
  <div class="workflow-toolbar">
    <button class="primary-button" disabled={busy || !fileReady}
      >{busy
        ? committing
          ? 'Saving…'
          : 'Connecting…'
        : source
          ? 'Save connection and reload'
          : kind === 'bridge'
            ? mode === 'adapter' && !startOnSave
              ? 'Save disabled bridge'
              : 'Attach bridge'
            : 'Connect server'}</button
    >
    <button
      type="button"
      class="secondary-button"
      disabled={committing}
      onclick={cancel}>Cancel</button
    >
  </div>
</form>

<style>
  .scaffold,
  .launch-fields {
    display: grid;
    gap: 0.65rem;
  }
  .scaffold,
  .launch-settings {
    margin: 1rem 0;
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: 0.6rem;
  }
  .scaffold code {
    overflow-wrap: anywhere;
  }
  .scaffold button {
    justify-self: start;
  }
  .launch-settings summary {
    cursor: pointer;
    font-weight: 600;
  }
  .launch-fields {
    margin-top: 1rem;
  }
  .launch-fields label {
    display: grid;
    gap: 0.4rem;
  }
  .launch-fields textarea {
    font-family: monospace;
    resize: vertical;
    min-width: 0;
  }
  .workflow-form > .start-choice {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    margin-bottom: 0.25rem;
  }
  .start-choice input {
    inline-size: 1rem;
    block-size: 1rem;
    margin: 0;
  }
</style>
