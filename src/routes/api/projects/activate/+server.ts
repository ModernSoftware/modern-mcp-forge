import { nativeProjects } from '$lib/server/mcpack/session';
import { projectTransition } from '$lib/server/mcpack/project-transition';
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
  activateProject,
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
      !('projectId' in payload) ||
      typeof payload.projectId !==
        'string'
    ) {
      return json(
        {
          error:
            'projectId is required.'
        },
        {
          status: 400
        }
      );
    }

    try {
      const selectedValue = payload.projectId;
      const project = await projectTransition(async () => {
        const project = activateProject(
          selectedValue
        );
        await nativeProjects.close();
        return project;
      });

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
