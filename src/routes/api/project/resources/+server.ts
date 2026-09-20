import {
  json
} from '@sveltejs/kit';

import type {
  RequestHandler
} from './$types';

import {
  addResourceToManifest,
  ManifestAuthoringError,
  ManifestConflictError
} from '$lib/server/project/manifest-service';

export const POST:
  RequestHandler =
  async ({ request }) => {
    let input: unknown;

    try {
      input =
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

    try {
      const resource =
        await addResourceToManifest(
          input
        );

      return json(
        {
          resource
        },
        {
          status: 201
        }
      );
    } catch (error) {
      if (
        error instanceof
        ManifestConflictError
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
        ManifestAuthoringError
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
