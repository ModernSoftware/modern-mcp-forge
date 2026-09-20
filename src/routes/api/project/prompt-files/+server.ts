import {
  json
} from '@sveltejs/kit';

import type {
  RequestHandler
} from './$types';

import {
  listProjectPromptFiles
} from '$lib/server/project/prompt-files';

export const GET:
  RequestHandler =
  async () =>
    json({
      files:
        listProjectPromptFiles()
    });
