import type { PageServerLoad } from './$types';

import { getWorkbenchTools } from '$lib/server/workbench/tools';

export const load: PageServerLoad = async () => ({
  tools: getWorkbenchTools()
});
