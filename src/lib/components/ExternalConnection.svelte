<script lang="ts">
  import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
  import {
    canLeaveProject,
    registerProjectLeaveGuard
  } from '$lib/navigation/project-leave';
  import type { ProjectSource } from '$lib/server/sources/schema';
  import { onMount, untrack } from 'svelte';
  let { projectId, generation, source } = $props<{
    projectId: string;
    generation: number;
    source?: Extract<ProjectSource, { kind: 'external' }>;
  }>();
  let id = $state(untrack(() => source?.id ?? ''));
  let url = $state(untrack(() => source?.url ?? ''));
  let auth = $state(
    untrack(() => (source?.bearerTokenEnv ? 'bearer' : 'none'))
  );
  let naming = $state<'always' | 'collisions'>(
    untrack(() => (source ? (source.naming ?? 'always') : 'collisions'))
  );
  let tokenEnv = $state(untrack(() => source?.bearerTokenEnv ?? ''));
  let baseline = $state(
    untrack(() =>
      JSON.stringify([id, url, naming, auth, auth === 'bearer' ? tokenEnv : ''])
    )
  );
  let dirty = $derived(
    JSON.stringify([
      id,
      url,
      naming,
      auth,
      auth === 'bearer' ? tokenEnv : ''
    ]) !== baseline
  );
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
  async function save() {
    if (busy) return;
    busy = true;
    error = '';
    let navigate = false;
    pending = new AbortController();
    try {
      const response = await fetch('/api/project/external', {
        method: 'POST',
        signal: pending.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          generation,
          action: 'preview',
          operation: source ? 'update' : 'create',
          source: {
            id,
            kind: 'external',
            enabled: source?.enabled ?? true,
            naming,
            url,
            ...(auth === 'bearer' ? { bearerTokenEnv: tokenEnv.trim() } : {})
          }
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      if (leaving) return;
      committing = true;
      const saved = await fetch('/api/project/external', {
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
      baseline = JSON.stringify([
        id,
        url,
        naming,
        auth,
        auth === 'bearer' ? tokenEnv : ''
      ]);
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
      await goto(`/project/external/${encodeURIComponent(id)}`, {
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
    >Connection name<input
      bind:value={id}
      required
      disabled={busy || Boolean(source)}
      maxlength="64"
      placeholder="support"
    /></label
  >
  <label
    >Published names<select aria-label="Published names" bind:value={naming} disabled={busy}>
      <option value="collisions">Prefix only colliding names</option>
      <option value="always">Always prefix with connection name</option>
    </select></label
  >
  <p class="workflow-muted">
    Applies to tools, resources and prompts. Resource URIs always identify their
    connection. Reconnect agents after changing published names.
  </p>
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
      Enter only the variable name. In the terminal that starts Forge, set that
      variable to the access token issued for this server. Restart Forge after
      changing the value.
    </p>
  {/if}
  <p class="workflow-notice">
    Connect only servers you trust. Forge sends this source's configured
    credential and test arguments to it. Tools may perform real actions; Forge
    does not retry failed calls.
  </p>
  <div class="workflow-toolbar">
    <button class="primary-button" disabled={busy}
      >{busy
        ? committing
          ? 'Saving…'
          : 'Connecting…'
        : source
          ? 'Save connection and reload'
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
