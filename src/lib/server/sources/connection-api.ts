import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { BridgeSourceAdapter } from './bridge';
import { createBridgeStarter } from './bridge-starter';
import type { UpstreamKind } from './upstream';
import { validateLocalRequest } from '$lib/server/local-request-guard';
import { getActiveProjectRecord } from '$lib/server/projects/project-service';
import { projectTransition } from '$lib/server/mcpack/project-transition';
import { NativeProjectError } from '$lib/server/mcpack/session';
import { projectSources } from '$lib/server/sources/manager';
import { prepareConnectionChange } from '$lib/server/sources/authoring';
import { validateCatalogNames } from '$lib/server/sources/catalog';
import {
  stageConnectionDraft,
  takeConnectionDraft,
  type VerifiedConnectionChange
} from '$lib/server/sources/connection-drafts';
import { ExternalSourceAdapter } from '$lib/server/sources/external';
import { ProjectSourceSchema, sourceId } from '$lib/server/sources/schema';

const identity = {
  projectId: z.string(),
  generation: z.number().int().nonnegative()
};
const Input = z.discriminatedUnion('action', [
  z
    .object({
      ...identity,
      action: z.literal('scaffold'),
      id: sourceId,
      runtime: z.enum(['node', 'python'])
    })
    .strict(),
  z
    .object({
      ...identity,
      action: z.literal('preview'),
      operation: z.enum(['create', 'update']),
      source: ProjectSourceSchema
    })
    .strict(),
  z
    .object({ ...identity, action: z.literal('commit'), ticket: z.uuid() })
    .strict(),
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
export async function handleConnectionRequest(
  request: Request,
  kind: UpstreamKind
) {
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
          .sources.some((entry) => entry.id === input.id && entry.kind === kind)
      )
        throw new NativeProjectError(`Unknown ${kind} source.`);
      return json({
        result: await projectSources.invoke(
          input.projectId,
          input.generation,
          input.id,
          {
            kind: input.kind,
            name: input.name,
            arguments: input.arguments,
            signal: request.signal,
            origin: 'workbench'
          }
        )
      });
    }
    return await projectTransition(async () => {
      const project = current();
      if (input.action === 'scaffold') {
        if (kind !== 'bridge')
          throw new NativeProjectError('Only bridge sources have starters.');
        if (
          projectSources
            .snapshot()
            .sources.some((source) => source.id === input.id)
        )
          throw new NativeProjectError('Source ID already exists.', 409);
        return json(createBridgeStarter(project, input.id, input.runtime));
      }
      let verified: VerifiedConnectionChange;
      if (input.action === 'commit') {
        verified = takeConnectionDraft(
          project.id,
          input.generation,
          input.ticket,
          kind
        );
      } else {
        const change = prepareConnectionChange(
          project,
          input.action === 'preview'
            ? { action: input.operation, source: input.source }
            : input,
          kind
        );
        const { candidate, manifest } = change;
        const adapter =
          candidate?.kind === 'bridge'
            ? new BridgeSourceAdapter(project.path, candidate)
            : candidate
              ? new ExternalSourceAdapter(candidate)
              : undefined;
        try {
          await adapter?.start(request.signal);
          if (candidate && adapter) {
            const catalog = await adapter.discover();
            const planned = projectSources.planNames(
              project.id,
              manifest.sources ?? [],
              manifest,
              { id: candidate.id, catalog }
            );
            validateCatalogNames(manifest, [...planned.values()]);
          }
          request.signal.throwIfAborted();
          verified = { kind, change, adapter };
          if (input.action === 'preview') {
            const ticket = await stageConnectionDraft(
              project.id,
              input.generation,
              verified
            );
            return json(
              { ticket },
              { headers: { 'cache-control': 'no-store' } }
            );
          }
        } catch (error) {
          await adapter?.close();
          throw error;
        }
      }
      const { change, adapter } = verified;
      const { candidate, manifest } = change;
      try {
        request.signal.throwIfAborted();
        if (adapter && adapter.health().status !== 'ready')
          throw new NativeProjectError(
            'The connection closed before saving. Connect again.'
          );
        change.commit();
      } catch (error) {
        await adapter?.close();
        throw error;
      }
      return json({
        snapshot: await projectSources.open(
          project.id,
          project.path,
          manifest.sources ?? [],
          {
            legacy: manifest,
            prepared:
              candidate && adapter ? { id: candidate.id, adapter } : undefined
          }
        )
      });
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: NativeProjectError.is(error) ? error.status : 400 }
    );
  }
}
