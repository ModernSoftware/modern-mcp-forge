import { redirect } from '@sveltejs/kit';
import { getActiveProjectRecord } from '$lib/server/projects/project-service';
import { nativeWorkspace } from '$lib/server/sources/authoring';
import { projectSources } from '$lib/server/sources/manager';
export const load = () => {
  const project = getActiveProjectRecord();
  if (!project) redirect(303, '/projects');
  return { ...nativeWorkspace(project), snapshot: projectSources.snapshot() };
};
