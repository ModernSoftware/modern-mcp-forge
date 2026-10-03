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
  let tokenEnv = $state(untrack(() => source?.bearerTokenEnv ?? ''));
  let baseline = $state(untrack(() => JSON.stringify([id, url, tokenEnv])));
  let dirty = $derived(JSON.stringify([id, url, tokenEnv]) !== baseline);
  let busy = $state(false);
  let error = $state('');
  onMount(() =>
    registerProjectLeaveGuard(
      () =>
        !busy &&
        (!dirty || window.confirm('Discard unsaved connection changes?'))
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
    try {
      const response = await fetch('/api/project/external', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          generation,
          action: source ? 'update' : 'create',
          source: {
            id,
            kind: 'external',
            enabled: source?.enabled ?? true,
            url,
            ...(tokenEnv ? { bearerTokenEnv: tokenEnv } : {})
          }
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      baseline = JSON.stringify([id, url, tokenEnv]);
      navigate = true;
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    } finally {
      busy = false;
      await invalidateAll();
    }
    if (navigate)
      await goto(`/project/external/${encodeURIComponent(id)}`, {
        invalidateAll: true
      });
  }
</script>

<svelte:window
  onbeforeunload={(event) => {
    if (dirty) {
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
  <p class="workflow-muted">
    Names are prefixed with this connection name. Resource URIs get a separate
    Forge namespace. Existing connections keep their identity.
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
    >Bearer token environment variable (optional)<input
      bind:value={tokenEnv}
      disabled={busy}
      placeholder="SUPPORT_MCP_TOKEN"
    /></label
  >
  <p class="workflow-muted">
    Enter the variable name, never its secret value. Set it in the environment
    that starts Forge. Bearer tokens require HTTPS except on loopback. OAuth
    login, custom headers and legacy SSE transport are not supported in this
    slice.
  </p>
  <p class="workflow-notice">
    Connect only servers you trust. Forge sends this source's configured
    credential and test arguments to it. Tools may perform real actions; Forge
    does not retry failed calls.
  </p>
  <button class="primary-button" disabled={busy}
    >{busy
      ? 'Connecting…'
      : source
        ? 'Save connection and reload'
        : 'Connect server'}</button
  >
</form>
