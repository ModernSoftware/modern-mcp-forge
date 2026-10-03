import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { validateLocalRequest } from '$lib/server/local-request-guard';
import { getActiveProjectRecord } from '$lib/server/projects/project-service';
import { projectTransition } from '$lib/server/mcpack/project-transition';
import { NativeProjectError } from '$lib/server/mcpack/session';
import { projectSources } from '$lib/server/sources/manager';
import { startProjectSources } from '$lib/server/sources/project';
import {
  saveExternalSource,
  changeExternalSource
} from '$lib/server/sources/authoring';
import { ProjectSourceSchema } from '$lib/server/sources/schema';

const identity = {
  projectId: z.string(),
  generation: z.number().int().nonnegative()
};
const Input = z.discriminatedUnion('action', [
  z
    .object({
      ...identity,
      action: z.enum(['create', 'update']),
      source: ProjectSourceSchema
    })
    .strict(),
  z
    .object({
      ...identity,
      action: z.enum(['enable', 'disable', 'remove']),
      id: z.string()
    })
    .strict(),
  z
    .object({
      ...identity,
      action: z.literal('invoke'),
      id: z.string(),
      kind: z.enum(['tool', 'resource', 'prompt']),
      name: z.string(),
      arguments: z.record(z.string(), z.unknown())
    })
    .strict()
]);
export const POST: RequestHandler = async ({ request }) => {
  const rejected = validateLocalRequest(request);
  if (rejected) return rejected;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 64 * 1024)
      throw new NativeProjectError('Request exceeds 64 KiB.');
    const input = Input.parse(JSON.parse(text));
    const current = () => {
      const project = getActiveProjectRecord();
      if (
        !project ||
        project.id !== input.projectId ||
        projectSources.snapshot().generation !== input.generation
      )
        throw new NativeProjectError(
          'Project sources changed. Refresh before continuing.',
          409
        );
      return project;
    };
    if (input.action === 'invoke') {
      current();
      if (
        !projectSources
          .snapshot()
          .sources.some(
            (entry) => entry.id === input.id && entry.kind === 'external'
          )
      )
        throw new NativeProjectError('External source not found.');
      return json({
        result: await projectSources.invoke(
          input.projectId,
          input.generation,
          input.id,
          {
            kind: input.kind,
            name: input.name,
            arguments: input.arguments,
            signal: request.signal
          }
        )
      });
    }
    return await projectTransition(async () => {
      const project = current();
      if ('source' in input)
        saveExternalSource(project, input.source, input.action === 'create');
      else changeExternalSource(project, input.id, input.action);
      return json({ snapshot: await startProjectSources(project) });
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: NativeProjectError.is(error) ? error.status : 400 }
    );
  }
};
