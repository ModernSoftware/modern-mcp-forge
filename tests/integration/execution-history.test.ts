import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import {
  closeDatabase,
  getDatabase
} from '$lib/server/database';

import {
  completeToolExecution,
  failToolExecution,
  startToolExecution
} from '$lib/server/mcp/execution-log';

import {
  clearProjectForProcess,
  selectProjectForProcess
} from '$lib/server/project/project-selection';

import {
  getExecution,
  getExecutionStats,
  listExecutions
} from '$lib/server/workbench/executions';

import {
  createManifest,
  createTempDirectory,
  removeTempDirectory,
  writeProject
} from '../helpers/project';

let sandbox: string;
let projectRoot: string;

beforeEach(() => {
  closeDatabase();
  sandbox = createTempDirectory('modern-mcp-forge-history-');
  projectRoot = join(sandbox, 'project');

  process.env.MCP_FORGE_DB_PATH = join(sandbox, 'forge.db');
  selectProjectForProcess(writeProject(projectRoot, createManifest()));
});

afterEach(() => {
  clearProjectForProcess();
  closeDatabase();
  delete process.env.MCP_FORGE_DB_PATH;
  removeTempDirectory(sandbox);
});

describe('execution history', () => {
  test('records a successful execution', () => {
    const execution = startToolExecution(
      'example',
      'node',
      { text: 'hello' },
      './tools/example.mjs'
    );

    completeToolExecution(
      execution,
      {
        content: [{ type: 'text', text: 'done' }]
      },
      {
        stderr: 'diagnostic',
        exitCode: 0,
        entrypoint: '/absolute/example.mjs'
      }
    );

    const detail = getExecution(execution.id);

    expect(detail).not.toBeNull();
    expect(detail?.status).toBe('succeeded');
    expect(detail?.toolName).toBe('example');
    expect(detail?.runtime).toBe('node');
    expect(detail?.stderrText).toBe('diagnostic');
    expect(detail?.exitCode).toBe(0);
    expect(detail?.entrypoint).toBe('/absolute/example.mjs');
    expect(JSON.parse(detail?.argumentsJson ?? '{}')).toEqual({ text: 'hello' });
    expect(JSON.parse(detail?.resultJson ?? '{}')).toMatchObject({
      content: [{ type: 'text', text: 'done' }]
    });
  });

  test('records a failed execution', () => {
    const execution = startToolExecution('example', 'python', {});

    failToolExecution(
      execution,
      new Error('boom'),
      {
        stderr: 'trace',
        exitCode: 9
      }
    );

    const detail = getExecution(execution.id);

    expect(detail?.status).toBe('failed');
    expect(detail?.errorText).toContain('boom');
    expect(detail?.stderrText).toBe('trace');
    expect(detail?.exitCode).toBe(9);
  });

  test('lists newest executions first and respects limit', () => {
    const first = startToolExecution('first', 'node', {});
    completeToolExecution(first, { ok: true });

    const second = startToolExecution('second', 'node', {});
    completeToolExecution(second, { ok: true });

    expect(listExecutions(1)).toHaveLength(1);
    expect(listExecutions(1)[0].toolName).toBe('second');
  });

  test('calculates project execution stats', () => {
    const success = startToolExecution('success', 'node', {});
    completeToolExecution(success, { ok: true });

    const failure = startToolExecution('failure', 'node', {});
    failToolExecution(failure, new Error('nope'));

    expect(getExecutionStats()).toMatchObject({
      total: 2,
      succeeded: 1,
      failed: 1
    });
  });

  test('isolates history by project id', () => {
    const firstProject = createManifest({ name: 'first' });
    selectProjectForProcess(writeProject(projectRoot, firstProject));

    const firstExecution = startToolExecution('first-tool', 'node', {});
    completeToolExecution(firstExecution, { ok: true });

    const secondRoot = join(sandbox, 'second-project');
    const secondProject = createManifest({ name: 'second' });
    selectProjectForProcess(writeProject(secondRoot, secondProject));

    const secondExecution = startToolExecution('second-tool', 'node', {});
    completeToolExecution(secondExecution, { ok: true });

    expect(listExecutions().map((item) => item.toolName)).toEqual(['second-tool']);
    expect(getExecution(firstExecution.id)).toBeNull();

    selectProjectForProcess(join(projectRoot, 'forge.project.json'));
    expect(listExecutions().map((item) => item.toolName)).toEqual(['first-tool']);
    expect(getExecution(secondExecution.id)).toBeNull();
  });

  test('stores globally unique execution uids', () => {
    const one = startToolExecution('one', 'node', {});
    const two = startToolExecution('two', 'node', {});

    expect(one.executionUid).not.toBe(two.executionUid);
  });

  test('database rows always carry the active project id', () => {
    const manifest = createManifest({ name: 'project-id-check' });
    selectProjectForProcess(writeProject(projectRoot, manifest));

    const execution = startToolExecution('tool', 'node', {});

    const row = getDatabase()
      .query<{ project_id: string }, [number]>(`
        SELECT project_id
        FROM tool_executions
        WHERE id = ?
      `)
      .get(execution.id);

    expect(row?.project_id).toBe(manifest.project.id);
  });
});
