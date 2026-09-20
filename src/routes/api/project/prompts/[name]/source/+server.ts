import {
  json
} from '@sveltejs/kit';

import type {
  RequestHandler
} from './$types';

import {
  createStarterPromptTemplate,
  PromptSourceConflictError,
  PromptSourceError,
  readPromptTemplate,
  savePromptTemplate
} from '$lib/server/project/prompt-source-service';

export const GET:
  RequestHandler =
  async ({ params }) => {
    try {
      return json(
        readPromptTemplate(
          params.name
        )
      );
    } catch (error) {
      if (
        error instanceof
        PromptSourceError
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
        createStarterPromptTemplate(
          params.name
        ),
        {
          status: 201
        }
      );
    } catch (error) {
      if (
        error instanceof
        PromptSourceConflictError
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
        PromptSourceError
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
        savePromptTemplate(
          params.name,
          payload.content
        );

      return json({
        info,
        message:
          `Prompt "${params.name}" was saved.`
      });
    } catch (error) {
      if (
        error instanceof
        PromptSourceError
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
