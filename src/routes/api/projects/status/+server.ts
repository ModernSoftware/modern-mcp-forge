import {
  json
} from '@sveltejs/kit';

import type {
  RequestHandler
} from './$types';

import {
  validateLocalRequest
} from '$lib/server/local-request-guard';

import {
  getActiveProjectContext
} from '$lib/server/project/loader';

export const GET:
  RequestHandler =
  async ({ request }) => {
    const rejection =
      validateLocalRequest(
        request
      );

    if (rejection) {
      return rejection;
    }

    const project =
      getActiveProjectContext();

    return json({
      active:
        project !== null,
      project
    });
  };
