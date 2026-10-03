import { redirect } from '@sveltejs/kit';
import { getActiveProjectRecord } from '$lib/server/projects/project-service';
import { nativeWorkspace } from '$lib/server/sources/authoring';
import { projectCatalog } from '$lib/server/sources/catalog';
import { loadProjectManifest } from '$lib/server/project/loader';
import { projectSources } from '$lib/server/sources/manager';
export const load = () => {
  const project = getActiveProjectRecord();
  if (!project) redirect(303, '/projects');
  let catalogError: string | undefined;
  try {
    projectCatalog(loadProjectManifest());
  } catch (error) {
    catalogError = error instanceof Error ? error.message : String(error);
  }
  return {
    ...nativeWorkspace(project),
    catalogError,
    snapshot: projectSources.snapshot()
  };
};
