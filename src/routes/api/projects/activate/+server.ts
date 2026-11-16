import { projectSources } from '$lib/server/sources/manager';
import { startProjectSources } from '$lib/server/sources/project';
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
  getActiveProjectRecord,
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
      const resume = 'resume' in payload && payload.resume === true;
      const project = await projectTransition(async () => {
        if (resume) {
          const active = getActiveProjectRecord();
          if (!active?.available || active.id !== selectedValue) return null;
          const snapshot = projectSources.snapshot();
          if (snapshot.project !== active.id || snapshot.status === 'stopped')
            await startProjectSources(active);
          return active;
        }
        const project = activateProject(
          selectedValue
        );
        await nativeProjects.close();
        await startProjectSources(project);
        return project;
      });

      if (!project)
        return json(
          { error: 'Selected project changed. Refresh the project list.' },
          { status: 409 }
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
