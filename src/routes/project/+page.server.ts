import type { PageServerLoad } from './$types';
import {
  getActiveProjectContext,
  loadProjectManifest
} from '$lib/server/project/loader';
import { listDefinitions } from '$lib/server/project/definition-service';

import { projectSources } from '$lib/server/sources/manager';
import { projectCatalog } from '$lib/server/sources/catalog';

export const load: PageServerLoad = async () => {
  let catalogError: string | undefined;
  try {
    projectCatalog(loadProjectManifest());
  } catch (error) {
    catalogError = error instanceof Error ? error.message : String(error);
  }
  return {
    sources: projectSources.snapshot(),
    catalogError,
    project: getActiveProjectContext(),
    manifest: loadProjectManifest(),
    definitions: listDefinitions()
  };
};
