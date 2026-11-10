import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateLocalRequest } from '$lib/server/local-request-guard';
const retired: RequestHandler = ({ request }) =>
  validateLocalRequest(request) ??
  json(
    {
      error:
        'The standalone preview has been retired. Open a project and attach its MCPack manifest in Configuration.'
    },
    { status: 410 }
  );
export const GET = retired;
export const POST = retired;
