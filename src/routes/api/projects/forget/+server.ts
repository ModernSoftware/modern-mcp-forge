import { projectSources } from '$lib/server/sources/manager';
import { projectTransition } from '$lib/server/mcpack/project-transition';
import { getActiveProjectRecord } from '$lib/server/projects/project-service';
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
  forgetProject
} from '$lib/server/projects/project-service';

export const POST:
  RequestHandler =
  async ({ request }) => {
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
      typeof payload !== 'object' ||
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

    const projectId = payload.projectId;
    await projectTransition(async () => {
      if (getActiveProjectRecord()?.id === projectId) await projectSources.close();
      forgetProject(projectId);
    });

    return json({
      ok: true
    });
  };
