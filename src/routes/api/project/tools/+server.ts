import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import {
  addToolToManifest,
  ManifestAuthoringError,
  ManifestConflictError
} from '$lib/server/project/manifest-service';

export const POST: RequestHandler = async ({ request }) => {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return json(
      { error: 'Request body must contain valid JSON.' },
      { status: 400 }
    );
  }

  try {
    const tool = await addToolToManifest(payload);

    return json(
      {
        tool,
        message: `Tool "${tool.name}" was added to forge.project.json.`
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ManifestConflictError) {
      return json({ error: error.message }, { status: 409 });
    }

    if (error instanceof ManifestAuthoringError) {
      return json({ error: error.message }, { status: 400 });
    }

    throw error;
  }
};
