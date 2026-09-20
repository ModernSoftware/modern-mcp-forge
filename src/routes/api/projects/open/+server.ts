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
  openExistingProject,
  ProjectServiceError
} from '$lib/server/projects/project-service';

export const POST:
  RequestHandler =
  async ({
    request
  }) => {
    const rejection =
      validateLocalRequest(
        request
      );

    if (rejection) {
      return rejection;
    }

    let payload: unknown;

    try {
      payload =
        await request.json();
    } catch {
      return json(
        {
          error:
            'Request body must contain valid JSON.'
        },
        {
          status: 400
        }
      );
    }

    if (
      !payload ||
      typeof payload !==
        'object' ||
      !('folderPath' in payload) ||
      typeof payload.folderPath !==
        'string'
    ) {
      return json(
        {
          error:
            'folderPath is required.'
        },
        {
          status: 400
        }
      );
    }

    try {
      const project =
        openExistingProject(
          payload.folderPath
        );

      return json({
        project
      });
    } catch (error) {
      if (
        error instanceof
          ProjectServiceError
      ) {
        return json(
          {
            error:
              error.message
          },
          {
            status: 400
          }
        );
      }

      throw error;
    }
  };
