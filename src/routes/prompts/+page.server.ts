import { projectSources } from '$lib/server/sources/manager';
import { getActiveProjectKey } from '$lib/server/project/loader';
import type { PageServerLoad } from './$types';

import { getWorkbenchPrompts } from '$lib/server/workbench/prompts';

export const load: PageServerLoad = async () => ({
  nativeSources:
    projectSources.snapshot().project === getActiveProjectKey()
      ? projectSources.snapshot().sources
      : [],
  prompts: getWorkbenchPrompts()
});
