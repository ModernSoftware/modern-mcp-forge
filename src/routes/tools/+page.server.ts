import { projectSources } from '$lib/server/sources/manager';
import { getActiveProjectKey } from '$lib/server/project/loader';
import type { PageServerLoad } from './$types';

import { getWorkbenchTools } from '$lib/server/workbench/tools';

export const load: PageServerLoad = async () => ({
  nativeSources:
    projectSources.snapshot().project === getActiveProjectKey()
      ? projectSources.snapshot().sources
      : [],
  tools: getWorkbenchTools()
});
