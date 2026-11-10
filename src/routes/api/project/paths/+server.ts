import { json } from '@sveltejs/kit';
import { z } from 'zod';
import {
  applicationRoot,
  browseSourcePaths
} from '$lib/server/filesystem/source-paths';
import { getActiveProjectRecord } from '$lib/server/projects/project-service';
import { validateLocalRequest } from '$lib/server/local-request-guard';
import type { RequestHandler } from './$types';

const query = z
  .object({
    projectId: z.string(),
    kind: z.enum(['file', 'manifest', 'directory']),
    directory: z.string().max(4096),
    checkoutEnv: z
      .string()
      .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
      .optional()
  })
  .strict();

export const POST: RequestHandler = async ({ request }) => {
  const rejected = validateLocalRequest(request);
  if (rejected) return rejected;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 8192)
      return json({ error: 'Folder request is too large.' }, { status: 413 });
    const input = query.parse(JSON.parse(text));
    const project = getActiveProjectRecord();
    if (!project || project.id !== input.projectId)
      return json(
        { error: 'The active project changed. Reopen the picker.' },
        { status: 409 }
      );
    if (input.checkoutEnv && input.kind !== 'directory')
      throw new Error('Select files inside the Forge project.');
    const root = applicationRoot(project.path, input.checkoutEnv);
    return json(browseSourcePaths(root, input.directory, input.kind), {
      headers: { 'cache-control': 'no-store' }
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not browse this folder.'
      },
      { status: 400 }
    );
  }
};
