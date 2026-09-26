import { nativeProjects } from '$lib/server/mcpack/session';
import type {
  LayoutServerLoad
} from './$types';

import {
  getActiveProjectContext
} from '$lib/server/project/loader';

export const load:
  LayoutServerLoad =
  async () => ({
    nativeProject: (() => {
      const native = nativeProjects.snapshot();
      return native ? { name: native.name, status: native.status } : null;
    })(),
    activeProject:
      getActiveProjectContext()
  });
