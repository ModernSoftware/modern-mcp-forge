import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  atPointer,
  CaseDefinition,
  SavedCase,
  type ToolCase
} from '$lib/testing/named-case';
import { prepareArguments, readArguments } from '$lib/testing/tool-arguments';
import { atomicWrite } from './authoring';
import { NativeProjectError } from '../mcpack/session';
import { getDatabase } from '../database';
import { projectSources } from './manager';

const CaseFile = z
  .object({ version: z.literal(1), cases: z.array(SavedCase).max(500) })
  .strict()
  .refine(
    (doc) => new Set(doc.cases.map((c) => c.id)).size === doc.cases.length,
    'Duplicate case ID.'
  );
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const limit = 1024 * 1024;
function schemaHash(schema: unknown) {
  return hash(
    JSON.stringify(schema, (_, v) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, v[k]])
          )
        : v
    )
  );
}
export function caseFile(root: string) {
  const path = join(root, 'forge.cases.json');
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat && (!stat.isFile() || stat.size > limit))
    throw new NativeProjectError(
      'forge.cases.json must be a regular project file of at most 1 MiB.'
    );
  const text = stat ? readFileSync(path, 'utf8') : '';
  const cases = stat ? CaseFile.parse(JSON.parse(text)).cases : [];
  return {
    cases,
    revision: hash(text),
    write(next: ToolCase[], revision: string) {
      if (hash(text) !== revision)
        throw new NativeProjectError(
          'Cases changed. Refresh cases and review your edits.',
          409
        );
      const data =
        JSON.stringify(CaseFile.parse({ version: 1, cases: next }), null, 2) +
        '\n';
      if (Buffer.byteLength(data) > limit)
        throw new NativeProjectError('Case file exceeds 1 MiB.');
      atomicWrite(path, data);
    }
  };
}
type Target = Pick<ToolCase, 'source' | 'sourceKind' | 'tool'>;
function caseTargets() {
  const targets = new Map<
    string,
    ReturnType<typeof projectSources.inspect>['catalog']['tools'][number]
  >();
  for (const s of projectSources.snapshot().sources) {
    if (s.status !== 'ready') continue;
    const tools =
      s.kind === 'native'
        ? s.catalog.tools
        : projectSources.inspect(s.id).catalog.tools;
    for (const tool of tools)
      targets.set(JSON.stringify([s.id, s.kind, tool.name]), tool);
  }
  return (target: Target) =>
    targets.get(
      JSON.stringify([target.source, target.sourceKind, target.tool])
    );
}
export function listCases(projectId: string, root: string) {
  const file = caseFile(root);
  const toolFor = caseTargets();
  const runs = getDatabase()
    .query<
      {
        case_id: string;
        definition_hash: string;
        passed: number;
        ran_at: string;
      },
      [string]
    >(
      'SELECT case_id, definition_hash, passed, ran_at FROM case_last_run WHERE project_id=?'
    )
    .all(projectId);
  const byCase = new Map(runs.map((r) => [r.case_id, r]));
  return {
    revision: file.revision,
    cases: file.cases.map((c) => {
      const tool = toolFor(c);
      const issue = !tool
        ? 'Tool missing, disabled or unavailable.'
        : c.schemaHash !== schemaHash(tool.inputSchema)
          ? 'Input schema changed. Review and save this case before running.'
          : '';
      const run = byCase.get(c.id);
      return {
        ...c,
        issue,
        lastRun:
          run?.definition_hash === hash(JSON.stringify(c))
            ? { passed: !!run.passed, at: run.ran_at }
            : null
      };
    })
  };
}
export function saveCase(
  root: string,
  revision: string,
  input: z.infer<typeof CaseDefinition>,
  id?: string
) {
  const file = caseFile(root);
  const existing = id && file.cases.find((c) => c.id === id);
  if (
    id &&
    (!existing ||
      existing.tool !== input.tool ||
      existing.source !== input.source ||
      existing.sourceKind !== input.sourceKind)
  )
    throw new NativeProjectError('Case identity changed. Refresh cases.', 409);
  if (
    file.cases.some(
      (c) =>
        c.id !== id &&
        c.source === input.source &&
        c.tool === input.tool &&
        c.sourceKind === input.sourceKind &&
        c.name === input.name
    )
  )
    throw new NativeProjectError('Use a distinct case name for this tool.');
  const tool = caseTargets()(input);
  if (!tool)
    throw new NativeProjectError(
      'Tool unavailable. Refresh the source and review the case.',
      409
    );
  const saved = SavedCase.parse({
    ...input,
    id: id ?? randomUUID(),
    schemaHash: schemaHash(tool.inputSchema)
  });
  file.write(
    id
      ? file.cases.map((c) => (c.id === id ? saved : c))
      : [...file.cases, saved],
    revision
  );
}
export async function runCase(
  project: string,
  generation: number,
  c: ToolCase,
  confirmLive: boolean,
  signal: AbortSignal
) {
  const tool = caseTargets()(c);
  if (!tool || schemaHash(tool.inputSchema) !== c.schemaHash)
    throw new NativeProjectError(
      'Tool unavailable or its input schema changed. Review the case before running.',
      409
    );
  const problems: { path: string; expected: unknown; actual: unknown }[] = [];
  const { validate } = prepareArguments(tool.inputSchema);
  const { errors } = readArguments(JSON.stringify(c.arguments), validate);
  if (c.expect.mode === 'invalid-input') {
    const path = c.expect.path;
    if (!validate || !errors.some((e) => e.path === path))
      problems.push({
        path,
        expected: 'Input validation error at this path',
        actual: validate ? errors : 'Local validation unavailable'
      });
  } else if (errors.length) {
    problems.push({
      path: 'Arguments',
      expected: 'Valid input',
      actual: errors
    });
  } else {
    if (
      !confirmLive &&
      (c.sourceKind === 'external' || tool.annotations?.readOnlyHint !== true)
    )
      throw new NativeProjectError(
        'Confirm this live tool call before running.'
      );
    const call = {
      kind: 'tool' as const,
      name: c.tool,
      arguments: c.arguments,
      origin: 'workbench' as const,
      signal
    };
    try {
      const result =
        c.sourceKind === 'native'
          ? await projectSources.testNative(project, generation, c.source, call)
          : await projectSources.invoke(
              project,
              generation,
              c.source,
              call,
              true
            );
      const failed = atPointer(result, '/isError') === true;
      if (failed !== (c.expect.mode === 'tool-error'))
        problems.push({
          path: '/isError',
          expected: c.expect.mode === 'tool-error',
          actual: failed
        });
      for (const field of c.expect.fields) {
        const actual = atPointer(result, field.path);
        if (!isDeepStrictEqual(actual, field.value))
          problems.push({
            path: field.path,
            expected: field.value,
            actual: actual === undefined ? '(missing)' : actual
          });
      }
    } catch (error) {
      problems.push({
        path: 'Invocation',
        expected: 'MCP tool result',
        actual: error instanceof Error ? error.message : 'Request failed'
      });
    }
  }
  const passed = !problems.length;
  getDatabase()
    .query(
      'INSERT OR REPLACE INTO case_last_run(project_id,case_id,definition_hash,passed,ran_at) VALUES(?,?,?,?,?)'
    )
    .run(
      project,
      c.id,
      hash(JSON.stringify(c)),
      Number(passed),
      new Date().toISOString()
    );
  return { passed, problems };
}
