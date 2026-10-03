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
  setCapabilityEnabled,
  createNativeCapability,
  updateNativeDefinition,
  attachNativeSource,
  changeNativeSource,
  createNativeSource,
  readNativeFile,
  saveNativeFile
} from '$lib/server/sources/authoring';

const identity = { projectId: z.string(), id: z.string().min(1) };
const generation = { generation: z.number().int().nonnegative() };
const Input = z.discriminatedUnion('action', [
  z
    .object({
      ...identity,
      ...generation,
      action: z.literal('set-capability-enabled'),
      kind: z.enum(['tools', 'resources', 'prompts']),
      name: z.string(),
      enabled: z.boolean()
    })
    .strict(),
  z
    .object({
      ...identity,
      ...generation,
      action: z.literal('create-capability'),
      runtime: z.enum(['node', 'python']),
      kind: z.enum(['tools', 'resources', 'prompts']),
      name: z.string(),
      description: z.string().max(4096),
      options: z
        .object({
          worker: z.string(),
          handler: z.string().optional(),
          revision: z.string(),
          newWorker: z.boolean()
        })
        .strict()
        .optional()
    })
    .strict(),
  z
    .object({
      ...identity,
      ...generation,
      action: z.literal('update-definition'),
      kind: z.enum(['tools', 'resources', 'prompts']),
      originalName: z.string(),
      definition: z.unknown(),
      revision: z.string()
    })
    .strict(),
  z
    .object({
      ...identity,
      ...generation,
      action: z.literal('create'),
      runtime: z.enum(['node', 'python'])
    })
    .strict(),
  z
    .object({
      ...identity,
      ...generation,
      action: z.literal('attach'),
      manifest: z.string().min(1)
    })
    .strict(),
  z
    .object({
      ...identity,
      ...generation,
      action: z.enum(['enable', 'disable', 'remove'])
    })
    .strict(),
  z
    .object({ ...identity, action: z.literal('read'), path: z.string() })
    .strict(),
  z
    .object({
      ...identity,
      ...generation,
      action: z.literal('save'),
      path: z.string(),
      content: z.string(),
      revision: z.string()
    })
    .strict(),
  z
    .object({
      ...identity,
      ...generation,
      action: z.literal('invoke'),
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
    if (Buffer.byteLength(text) > 2 * 1024 * 1024)
      throw new NativeProjectError('Request exceeds the 2 MiB limit.');
    const input = Input.parse(JSON.parse(text));
    const current = () => {
      const project = getActiveProjectRecord();
      if (!project || project.id !== input.projectId)
        throw new NativeProjectError('Selected project changed.', 409);
      if (
        'generation' in input &&
        input.generation !== projectSources.snapshot().generation
      ) {
        throw new NativeProjectError(
          'Project sources changed. Refresh before continuing.',
          409
        );
      }
      return project;
    };
    if (input.action === 'invoke') {
      current();
      const result = await projectSources.invoke(
        input.projectId,
        input.generation,
        input.id,
        {
          kind: input.kind,
          name: input.name,
          arguments: input.arguments,
          signal: request.signal
        }
      );
      return json({ result });
    }
    return await projectTransition(async () => {
      const project = current();
      if (input.action === 'read')
        return json({ file: readNativeFile(project, input.id, input.path) });
      let file;
      if (input.action === 'set-capability-enabled')
        setCapabilityEnabled(
          project,
          input.id,
          input.kind,
          input.name,
          input.enabled
        );
      else if (input.action === 'create-capability')
        createNativeCapability(
          project,
          input.id,
          input.runtime,
          input.kind,
          input.name,
          input.description,
          input.options
        );
      else if (input.action === 'update-definition') {
        await projectSources.close();
        try {
          file = updateNativeDefinition(
            project,
            input.id,
            input.kind,
            input.originalName,
            input.definition,
            input.revision
          );
        } catch (error) {
          await startProjectSources(project);
          throw error;
        }
      } else if (input.action === 'create')
        createNativeSource(project, input.id, input.runtime);
      else if (input.action === 'attach')
        attachNativeSource(project, input.id, input.manifest);
      else if (input.action === 'save') {
        const before = readNativeFile(project, input.id, input.path);
        if (before.revision !== input.revision)
          throw new NativeProjectError(
            'File changed on disk. Reload before saving.',
            409
          );
        await projectSources.close();
        try {
          file = saveNativeFile(
            project,
            input.id,
            input.path,
            input.content,
            input.revision
          );
        } catch (error) {
          await startProjectSources(project);
          throw error;
        }
      } else changeNativeSource(project, input.id, input.action);
      const snapshot = await startProjectSources(project);
      // Runtime failure does not discard saved work: files remain editable.
      return json({ file, snapshot });
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      {
        status: NativeProjectError.is(error) ? error.status : 400
      }
    );
  }
};
