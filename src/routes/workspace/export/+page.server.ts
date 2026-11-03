import { redirect } from '@sveltejs/kit';
import { getActiveProjectRecord } from '$lib/server/projects/project-service';
import { loadProjectManifest } from '$lib/server/project/loader';
import {
  exportSources,
  previewExport
} from '$lib/server/deployment/native-export';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const project = getActiveProjectRecord();
  if (!project) redirect(303, '/projects');
  const manifest = loadProjectManifest();
  const sources = exportSources(manifest).map((s) => s.id);
  const id = url.searchParams.get('source') ?? sources[0];
  const base = { projectId: project.id, sources, id };
  if (!id) return { ...base, preview: null, issue: '' };
  try {
    return {
      ...base,
      preview: await previewExport(project.path, manifest, id),
      issue: ''
    };
  } catch (error) {
    return {
      ...base,
      preview: null,
      issue:
        error instanceof Error ? error.message : 'Unable to read the source.'
    };
  }
};
