import {
  json
} from '@sveltejs/kit';

import type {
  RequestHandler
} from './$types';

import {
  createStarterResourceSource,
  readResourceSource,
  ResourceSourceConflictError,
  ResourceSourceError,
  saveResourceSource
} from '$lib/server/project/resource-source-service';

export const GET:
  RequestHandler =
  async ({ params }) => {
    try {
      return json(
        readResourceSource(
          params.name
        )
      );
    } catch (error) {
      if (
        error instanceof
        ResourceSourceError
      ) {
        return json(
          {
            error:
              error.message
          },
          {
            status: 404
          }
        );
      }

      throw error;
    }
  };

export const POST:
  RequestHandler =
  async ({ params }) => {
    try {
      return json(
        createStarterResourceSource(
          params.name
        ),
        {
          status: 201
        }
      );
    } catch (error) {
      if (
        error instanceof
        ResourceSourceConflictError
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
        ResourceSourceError
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

export const PUT:
  RequestHandler =
  async ({
    params,
    request
  }) => {
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
      !('content' in payload) ||
      typeof payload.content !==
        'string'
    ) {
      return json(
        {
          error:
            'Request body must contain a string "content" property.'
        },
        {
          status: 400
        }
      );
    }

    try {
      const info =
        saveResourceSource(
          params.name,
          payload.content
        );

      return json({
        info,
        message:
          `Resource "${params.name}" was saved.`
      });
    } catch (error) {
      if (
        error instanceof
        ResourceSourceError
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
