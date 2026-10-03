import { projectSources } from '$lib/server/sources/manager';
import { getActiveProjectKey } from '$lib/server/project/loader';
import type { PageServerLoad } from './$types';

import { getWorkbenchResources } from '$lib/server/workbench/resources';

export const load: PageServerLoad = async () => ({
  nativeSources:
    projectSources.snapshot().project === getActiveProjectKey()
      ? projectSources.snapshot().sources
      : [],
  resources: getWorkbenchResources()
});
