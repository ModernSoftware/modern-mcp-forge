import {
  existsSync,
  mkdirSync,
  statSync
} from 'node:fs';

import {
  join,
  resolve
} from 'node:path';

import {
  json
} from '@sveltejs/kit';

import type {
  RequestHandler
} from './$types';

import {
  validateLocalRequest
} from '$lib/server/local-request-guard';

function validateFolderName(
  value: string
): string {
  const name = value.trim();

  if (!name) {
    throw new Error(
      'Folder name is required.'
    );
  }

  if (
    name === '.' ||
    name === '..' ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('\0')
  ) {
    throw new Error(
      'Folder name must be a single directory name, not a path.'
    );
  }

  return name;
}

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
      !('parentPath' in payload) ||
      typeof payload.parentPath !== 'string' ||
      !('name' in payload) ||
      typeof payload.name !== 'string'
    ) {
      return json(
        {
          error:
            'parentPath and name are required.'
        },
        {
          status: 400
        }
      );
    }

    try {
      const parentPath =
        resolve(
          payload.parentPath
        );

      if (
        !existsSync(parentPath) ||
        !statSync(parentPath).isDirectory()
      ) {
        throw new Error(
          `Parent directory does not exist: ${parentPath}`
        );
      }

      const name =
        validateFolderName(
          payload.name
        );

      const createdPath =
        join(
          parentPath,
          name
        );

      if (existsSync(createdPath)) {
        return json(
          {
            error:
              `A filesystem item named "${name}" already exists.`
          },
          {
            status: 409
          }
        );
      }

      mkdirSync(createdPath);

      return json(
        {
          path:
            createdPath
        },
        {
          status: 201
        }
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
