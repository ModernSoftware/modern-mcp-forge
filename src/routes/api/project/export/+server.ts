import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { getActiveProjectRecord } from '$lib/server/projects/project-service';
import { loadProjectManifest } from '$lib/server/project/loader';
import { validateLocalRequest } from '$lib/server/local-request-guard';
import { NativeProjectError } from '$lib/server/mcpack/session';
import { exportPack } from '$lib/server/deployment/native-export';
import { sourceId } from '$lib/server/sources/schema';
import type { RequestHandler } from './$types';

const selection = z
  .object({
    projectId: z.string(),
    id: sourceId,
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    capabilities: z.array(z.string().min(1)).optional(),
    files: z.array(z.string().min(1).max(4096)).max(2048)
  })
  .strict();

export const POST: RequestHandler = async ({ request }) => {
  const rejected = validateLocalRequest(request);
  if (rejected) return rejected;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 512 * 1024)
      throw new NativeProjectError('Export selection exceeds 512 KiB.');
    const input = selection.parse(JSON.parse(text));
    const project = getActiveProjectRecord();
    if (!project || project.id !== input.projectId)
      throw new NativeProjectError('Selected project changed.', 409);
    const blob = await exportPack(
      project.path,
      loadProjectManifest(),
      input.id,
      input.revision,
      input.files,
      input.capabilities
    );
    return new Response(blob, {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition':
          'attachment; filename="' + input.id + '-native.tar.gz"',
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Export failed.' },
      { status: NativeProjectError.is(error) ? error.status : 400 }
    );
  }
};
