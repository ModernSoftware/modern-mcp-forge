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
            mode === 'adapter' ? checkoutEnv : '',
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
      entrypoint = payload.entrypoint;
      starterNotice = `Created ${entrypoint}. Wire its hooks in your editor, then save the connection. You can also save it disabled and wire it later.`;
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    } finally {
      busy = false;
    }
  }
  async function save() {
    if (busy) return;
    busy = true;
    error = '';
    let navigate = false;
    pending = new AbortController();
    try {
      const args: unknown = kind === 'bridge' ? JSON.parse(argv || '[]') : [];
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
                    checkoutEnv.trim() && { checkoutEnv: checkoutEnv.trim() }),
                  entrypoint: entrypoint.trim(),
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
    <label
      >{mode === 'adapter' ? 'Adapter file' : 'Stdio entrypoint'}<input
        bind:value={entrypoint}
        required
        disabled={busy}
        placeholder={mode === 'adapter'
          ? `bridges/my-source/adapter.${runtime === 'node' ? 'mjs' : 'py'}`
          : 'Project-relative server script'}
      /></label
    >
    {#if mode === 'adapter'}
      <p class="workflow-muted">
        Keep the adapter under this Forge project and commit it with
        forge.project.json. Its hooks discover and call your existing tools,
        resources and prompts.
      </p>
      {#if !source}
        <div>
          <button
            type="button"
            disabled={busy ||
              !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id) ||
              Boolean(entrypoint)}
            onclick={scaffold}>Create adapter file</button
          >
        </div>
        {#if starterNotice}<p role="status">{starterNotice}</p>{/if}
      {/if}
      <label
        >Application checkout variable (optional)<input
          aria-label="Application checkout variable"
          bind:value={checkoutEnv}
          disabled={busy}
          placeholder="MY_APP_ROOT"
          pattern="[A-Za-z_][A-Za-z0-9_]*"
        /></label
      >
      <p class="workflow-muted">
        Leave blank when the application is in this project. For a separate
        checkout, enter the name of an environment variable that points to its
        folder on this machine.
      </p>
      {#if runtime === 'python'}<p class="workflow-muted">
          The Forge Python host uses the mcp dependency listed in
          requirements-forge.txt. Use the adapter’s .venv or the application’s
          Python environment.
        </p>{/if}
      {#if !source}<label
          ><input type="checkbox" bind:checked={startOnSave} disabled={busy} /> Start
          and discover on save</label
        >{/if}
    {:else}
      <p class="workflow-muted">
        Select a project-relative script that already serves MCP over stdio.
      </p>
    {/if}
    <details>
      <summary>Launch settings</summary>
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
        Enter names only. Forge reads their values from its own environment when
        it launches the bridge.
      </p>
      <label
        >Script arguments (JSON array)<input
          bind:value={argv}
          disabled={busy}
          placeholder="[]"
        /></label
      >
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
    <button class="primary-button" disabled={busy}
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
