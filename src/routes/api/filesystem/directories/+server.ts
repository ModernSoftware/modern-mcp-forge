import {
  json
} from '@sveltejs/kit';

import type {
  RequestHandler
} from './$types';

import {
  browseDirectories
} from '$lib/server/filesystem/directory-browser';

import {
  validateLocalRequest
} from '$lib/server/local-request-guard';

export const GET:
  RequestHandler =
  async ({
    request,
    url
  }) => {
    const rejection =
      validateLocalRequest(
        request
      );

    if (rejection) {
      return rejection;
    }

    try {
      return json(
        browseDirectories(
          url.searchParams.get(
            'path'
          )
        )
      );
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : String(error)
        },
        {
          status: 400
        }
      );
    }
  };
