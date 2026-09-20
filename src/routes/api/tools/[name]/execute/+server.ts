import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import {
  executeToolByName,
  ToolNotFoundError
} from '$lib/server/execution/tool-execution-service';

export const POST: RequestHandler = async ({ params, request }) => {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return json(
      { error: 'Request body must be valid JSON.' },
      { status: 400 }
    );
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    !('arguments' in payload) ||
    !payload.arguments ||
    typeof payload.arguments !== 'object' ||
    Array.isArray(payload.arguments)
  ) {
    return json(
      { error: 'Request body must contain an "arguments" object.' },
      { status: 400 }
    );
  }

  try {
    const outcome = await executeToolByName(
      params.name,
      payload.arguments as Record<string, unknown>
    );

    return json(outcome);
  } catch (error) {
    if (error instanceof ToolNotFoundError) {
      return json({ error: error.message }, { status: 404 });
    }

    throw error;
  }
};
