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
  closeActiveProject
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

    await projectTransition(async () => {
      closeActiveProject();
      await nativeProjects.close();
    });

    return json({
      ok: true
    });
  };
