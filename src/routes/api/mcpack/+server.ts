import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { validateLocalRequest } from '$lib/server/local-request-guard';
import { nativeProjects, NativeProjectError } from '$lib/server/mcpack/session';
import { projectTransition } from '$lib/server/mcpack/project-transition';
import { closeActiveProject } from '$lib/server/projects/project-service';

const project = z.string().min(1);
const Action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('open'), manifestPath: project }),
  z.object({ action: z.literal('close') }),
  z.object({ action: z.literal('restart'), project }),
  z.object({ action: z.literal('read'), project, path: z.string() }),
  z.object({
    action: z.literal('save'),
    project,
    path: z.string(),
    content: z.string(),
    revision: z.string()
  }),
  z.object({
    action: z.literal('invoke'),
    project,
    kind: z.enum(['tool', 'resource', 'prompt']),
    name: z.string(),
    arguments: z.record(z.string(), z.unknown()).default({})
  })
]);

export const GET: RequestHandler = ({ request }) => {
  const rejection = validateLocalRequest(request);
  return rejection ?? json({ project: nativeProjects.snapshot() });
};

export const POST: RequestHandler = async ({ request }) => {
  const rejection = validateLocalRequest(request);
  if (rejection) return rejection;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 1024 * 1024)
      throw new NativeProjectError('Request exceeds 1 MiB.');
    const action = Action.parse(JSON.parse(text));
    switch (action.action) {
      case 'open':
        return json(
          await projectTransition(async () => {
            const project = await nativeProjects.open(action.manifestPath);
            closeActiveProject();
            return { project };
          })
        );
      case 'close':
        await projectTransition(() => nativeProjects.close());
        return json({ project: null });
      case 'restart':
        return json({ project: await nativeProjects.restart(action.project) });
      case 'read':
        return json({ source: await nativeProjects.readSource(action.project, action.path) });
      case 'save':
        return json(
          await nativeProjects.saveSource(
            action.project,
            action.path,
            action.content,
            action.revision
          )
        );
      case 'invoke':
        return json({
          result: await nativeProjects.invoke(
            action.project,
            action.kind,
            action.name,
            action.arguments,
            request.signal
          )
        });
    }
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      {
        status: NativeProjectError.is(error) ? error.status : 400
      }
    );
  }
};
