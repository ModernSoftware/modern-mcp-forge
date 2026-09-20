import type { PageServerLoad } from './$types';
import { getActiveProjectContext, loadProjectManifest } from '$lib/server/project/loader';
import { listDefinitions } from '$lib/server/project/definition-service';

export const load: PageServerLoad = async () => ({
  project: getActiveProjectContext(),
  manifest: loadProjectManifest(),
  definitions: listDefinitions()
});
