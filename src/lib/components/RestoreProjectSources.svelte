<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import type { Snippet } from 'svelte';
  import { activateProject } from '$lib/client/activate-project';
  import ProjectOpening from './ProjectOpening.svelte';
  import type { ProjectSourceManager } from '$lib/server/sources/manager';

  let {
    project,
    snapshot,
    cold,
    children
  }: {
    project: { id: string; name: string };
    snapshot: Pick<
      ReturnType<ProjectSourceManager['snapshot']>,
      'project' | 'status'
    >;
    cold?: boolean;
    children: Snippet;
  } = $props();

  const key = 'forge.workspace.running-project';
  let restoring = $state(false);
  let error = $state('');
  let attempted = false;

  $effect(() => {
    const { id } = project;
    try {
      if (
        snapshot.project === id &&
        (snapshot.status === 'ready' || snapshot.status === 'failed')
      ) {
        sessionStorage.setItem(key, id);
        attempted = false;
        error = '';
        return;
      }
      // A different tab may already be running the guarded resume request.
      const starting =
        snapshot.project === id && snapshot.status === 'starting';
      const stopped =
        snapshot.project === null &&
        snapshot.status === 'stopped' &&
        cold !== false;
      if (
        !(starting || stopped) ||
        attempted ||
        sessionStorage.getItem(key) !== id
      )
        return;
    } catch {
      // The explicit Start/Reload action also works with browser storage disabled.
      return;
    }
    attempted = true;
    void restore(id);
  });

  async function restore(id: string) {
    restoring = true;
    try {
      await activateProject(id, true);
      await invalidateAll();
    } catch (failure) {
      error = failure instanceof Error ? failure.message : String(failure);
    } finally {
      restoring = false;
    }
  }
</script>

{#if restoring}
  <ProjectOpening projectId={project.id} name={project.name} />
{:else}
  {#if error}<p class="workflow-error" role="alert">{error}</p>{/if}
  {@render children()}
{/if}
