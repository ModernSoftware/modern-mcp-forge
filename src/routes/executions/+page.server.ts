import type { PageServerLoad } from './$types';

import {
  getExecutionStats,
  listExecutions
} from '$lib/server/workbench/executions';

export const load: PageServerLoad = ({ depends }) => {
  depends('forge:execution-history');
  return { executions: listExecutions(100), stats: getExecutionStats() };
};
