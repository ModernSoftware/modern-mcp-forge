import type {
  PageServerLoad
} from './$types';

import {
  getWorkbenchPrompts
} from '$lib/server/workbench/prompts';

export const load:
  PageServerLoad =
  async () => ({
    prompts:
      getWorkbenchPrompts()
  });
