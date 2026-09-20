import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { getToolSourceInfo } from '$lib/server/project/source-service';
import { getWorkbenchTool } from '$lib/server/workbench/tools';

export const load: PageServerLoad = async ({ params }) => {
  const tool = getWorkbenchTool(params.name);

  if (!tool) {
    error(404, `Tool "${params.name}" was not found.`);
  }

  return {
    tool,
    source: getToolSourceInfo(params.name)
  };
};
