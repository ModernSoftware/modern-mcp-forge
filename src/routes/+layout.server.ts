import type {
  LayoutServerLoad
} from './$types';

import {
  getActiveProjectContext
} from '$lib/server/project/loader';

export const load:
  LayoutServerLoad =
  async () => ({
    activeProject:
      getActiveProjectContext()
  });
