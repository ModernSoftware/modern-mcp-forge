import type {
  PageServerLoad
} from './$types';

import {
  getWorkbenchResources
} from '$lib/server/workbench/resources';

export const load:
  PageServerLoad =
  async () => ({
    resources:
      getWorkbenchResources()
  });
