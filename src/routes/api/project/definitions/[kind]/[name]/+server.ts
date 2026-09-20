import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import {
  deleteDefinitionFromManifest,
  ManifestAuthoringError,
  ManifestConflictError,
  ManifestDefinitionNotFoundError,
  setDefinitionEnabled,
  updateDefinitionInManifest,
  type DefinitionKind
} from '$lib/server/project/manifest-service';

function parseKind(value: string): DefinitionKind | null {
  switch (value) {
    case 'tool':
    case 'resource':
    case 'prompt':
      return value;
    default:
      return null;
  }
}

function errorResponse(error: unknown) {
  if (error instanceof ManifestDefinitionNotFoundError) {
    return json({ error: error.message }, { status: 404 });
  }

  if (error instanceof ManifestConflictError) {
    return json({ error: error.message }, { status: 409 });
  }

  if (error instanceof ManifestAuthoringError) {
    return json({ error: error.message }, { status: 400 });
  }

  return null;
}

export const PUT: RequestHandler = async ({ params, request }) => {
  const kind = parseKind(params.kind);

  if (!kind) {
    return json({ error: 'Unknown definition kind.' }, { status: 404 });
  }

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
    const definition = await updateDefinitionInManifest(
      kind,
      params.name,
      payload
    );

    return json({ definition });
  } catch (error) {
    const known = errorResponse(error);
    if (known) return known;
    throw error;
  }
};

export const PATCH: RequestHandler = async ({ params, request }) => {
  const kind = parseKind(params.kind);

  if (!kind) {
    return json({ error: 'Unknown definition kind.' }, { status: 404 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return json(
      { error: 'Request body must contain valid JSON.' },
      { status: 400 }
    );
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    !('enabled' in payload) ||
    typeof payload.enabled !== 'boolean'
  ) {
    return json(
      { error: 'PATCH requires a boolean "enabled" property.' },
      { status: 400 }
    );
  }

  try {
    const definition = await setDefinitionEnabled(
      kind,
      params.name,
      payload.enabled
    );

    return json({ definition });
  } catch (error) {
    const known = errorResponse(error);
    if (known) return known;
    throw error;
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  const kind = parseKind(params.kind);

  if (!kind) {
    return json({ error: 'Unknown definition kind.' }, { status: 404 });
  }

  try {
    await deleteDefinitionFromManifest(
      kind,
      params.name
    );

    return json({
      ok: true,
      sourceFilesDeleted: false
    });
  } catch (error) {
    const known = errorResponse(error);
    if (known) return known;
    throw error;
  }
};
