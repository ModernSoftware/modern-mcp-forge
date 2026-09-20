import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { getExecution } from '$lib/server/workbench/executions';

export const load: PageServerLoad = async ({ params }) => {
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    error(404, 'Execution was not found.');
  }

  const execution = getExecution(id);

  if (!execution) {
    error(404, 'Execution was not found.');
  }

  return {
    execution
  };
};
