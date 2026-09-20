import type {
  PageServerLoad
} from './$types';

import {
  resolveDatabasePath
} from '$lib/server/database';

import {
  getActiveProjectContext
} from '$lib/server/project/loader';

import {
  listProjects
} from '$lib/server/projects/project-service';

export const load:
  PageServerLoad =
  async () => ({
    projects:
      listProjects(),
    activeProject:
      getActiveProjectContext(),
    databasePath:
      resolveDatabasePath()
  });
