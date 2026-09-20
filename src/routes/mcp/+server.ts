import type { RequestHandler } from './$types';

import { forgeMcpHandler } from '$lib/server/mcp/handler';
import { validateLocalMcpRequest } from '$lib/server/mcp/local-request-guard';

export const prerender = false;

const handle: RequestHandler = async ({ request }) => {
  const rejection = validateLocalMcpRequest(request);

  if (rejection) {
    return rejection;
  }

  return forgeMcpHandler.fetch(request);
};

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
