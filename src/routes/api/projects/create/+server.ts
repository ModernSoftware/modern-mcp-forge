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
  createProject,
  ProjectConflictError,
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

    const name =
      'name' in payload &&
      typeof payload.name ===
        'string'
        ? payload.name
        : undefined;

    const description =
      'description' in payload &&
      typeof payload.description ===
        'string'
        ? payload.description
        : undefined;

    try {
      const project =
        createProject({
          folderPath:
            payload.folderPath,
          name,
          description
        });

      return json(
        {
          project
        },
        {
          status: 201
        }
      );
    } catch (error) {
      if (
        error instanceof
          ProjectConflictError
      ) {
        return json(
          {
            error:
              error.message
          },
          {
            status: 409
          }
        );
      }

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
