import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getActiveProjectRecord } from '$lib/server/projects/project-service';
import { nativeDocument } from '$lib/server/sources/authoring';
import { projectSources } from '$lib/server/sources/manager';

export const load: PageServerLoad = ({ params }) => {
  const project = getActiveProjectRecord();
  if (!project) redirect(303, '/projects');
  try {
    const { manifestPath: _path, ...document } = nativeDocument(project, params.id);
    return { projectId: project.id, document, snapshot: projectSources.snapshot() };
  } catch (failure) {
    error(400, failure instanceof Error ? failure.message : String(failure));
  }
};
