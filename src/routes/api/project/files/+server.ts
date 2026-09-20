import {
  json
} from '@sveltejs/kit';
import type {
  RequestHandler
} from './$types';

import {
  listProjectSourceFiles
} from '$lib/server/project/project-files';

export const GET: RequestHandler = async ({
  url
}) => {
  const runtime = url.searchParams.get('runtime');

  if (
    runtime !== 'python' &&
    runtime !== 'bun' &&
    runtime !== 'node'
  ) {
    return json(
      {
        error:
          'runtime must be "python", "bun", or "node".'
      },
      {
        status: 400
      }
    );
  }

  return json({
    files: listProjectSourceFiles(runtime)
  });
};
