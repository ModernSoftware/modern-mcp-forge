import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { CaseDefinition } from '$lib/testing/named-case';
import {
  caseFile,
  listCases,
  runCase,
  saveCase
} from '$lib/server/sources/named-cases';
import { projectSources } from '$lib/server/sources/manager';
import { NativeProjectError } from '$lib/server/mcpack/session';
import { getActiveProjectRecord } from '$lib/server/projects/project-service';
import { validateLocalRequest } from '$lib/server/local-request-guard';

const base = {
  projectId: z.string(),
  generation: z.number().int().nonnegative()
};
const revision = z.string().length(64);
const Input = z.discriminatedUnion('action', [
  z.object({ ...base, action: z.literal('list') }).strict(),
  z
    .object({
      ...base,
      action: z.literal('save'),
      revision,
      id: z.uuid().optional(),
      definition: CaseDefinition
    })
    .strict(),
  z
    .object({ ...base, action: z.literal('remove'), revision, id: z.uuid() })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal('run'),
      revision,
      id: z.uuid(),
      confirmLive: z.boolean()
    })
    .strict()
]);
export const POST: RequestHandler = async ({ request }) => {
  const rejected = validateLocalRequest(request);
  if (rejected) return rejected;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 256 * 1024)
      throw new NativeProjectError('Case request exceeds 256 KiB.');
    const input = Input.parse(JSON.parse(text));
    const project = getActiveProjectRecord();
    const snapshot = projectSources.snapshot();
    if (
      !project ||
      project.id !== input.projectId ||
      snapshot.generation !== input.generation ||
      (snapshot.project && snapshot.project !== project.id)
    )
      throw new NativeProjectError(
        'Project sources changed. Refresh before continuing.',
        409
      );
    if (input.action === 'save')
      saveCase(project.path, input.revision, input.definition, input.id);
    if (input.action === 'remove' || input.action === 'run') {
      const file = caseFile(project.path);
      const c = file.cases.find((c) => c.id === input.id);
      if (!c || file.revision !== input.revision)
        throw new NativeProjectError(
          'Cases changed. Refresh cases and review the selection.',
          409
        );
      if (input.action === 'remove')
        file.write(
          file.cases.filter((item) => item.id !== c.id),
          input.revision
        );
      else
        return json(
          await runCase(
            project.id,
            input.generation,
            c,
            input.confirmLive,
            request.signal
          )
        );
    }
    return json(listCases(project.id, project.path));
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: NativeProjectError.is(error) ? error.status : 400 }
    );
  }
};
