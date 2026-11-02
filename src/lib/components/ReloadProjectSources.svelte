<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { reloadProjectSources } from '$lib/client/reload-project-sources';
  let {
    projectId,
    generation,
    busy = $bindable(false)
  } = $props<{
    projectId: string;
    generation: number;
    busy?: boolean;
  }>();
  let notice = $state('');
  let error = $state('');
  async function reload() {
    if (busy) return;
    busy = true;
    notice = error = '';
    try {
      const next = await reloadProjectSources(projectId, generation);
      const unavailable = next.sources.filter(
        (source) => source.status === 'failed'
      );
      if (next.status === 'failed')
        notice = 'Reload stopped. Review the project error.';
      else if (unavailable.length)
        notice =
          'Reload finished. Unavailable sources: ' +
          unavailable.map((s) => s.id).join(', ') +
          '.';
      else notice = 'Sources reloaded. Reconnect agents to refresh discovery.';
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    } finally {
      try {
        await invalidateAll();
      } catch {
        error ||= 'Refresh this page to see the latest source status.';
      } finally {
        busy = false;
      }
    }
  }
</script>

<button
  class="secondary-button"
  disabled={busy}
  onclick={reload}
  title="Restart all enabled sources and read their saved files again"
  >Reload project sources</button
>
{#if notice}<span class="workflow-muted" role="status">{notice}</span>{/if}
{#if error}<span class="workflow-error" role="alert">{error}</span>{/if}
