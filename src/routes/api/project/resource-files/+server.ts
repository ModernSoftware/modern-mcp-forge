import {
  json
} from '@sveltejs/kit';

import type {
  RequestHandler
} from './$types';

import {
  listProjectResourceFiles
} from '$lib/server/project/resource-files';

export const GET:
  RequestHandler =
  async () =>
    json({
      files:
        listProjectResourceFiles()
    });
