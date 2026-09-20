import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeDatabase } from '$lib/server/database';
import type { ToolDefinition } from '$lib/server/project/schema';
import { getExecution } from '$lib/server/workbench/executions';

import {
  executeToolByName,
  executeToolDefinition,
  ToolNotFoundError
} from '$lib/server/execution/tool-execution-service';

import {
  clearProjectForProcess,
  selectProjectForProcess
} from '$lib/server/project/project-selection';

import {
  createManifest,
  createTempDirectory,
  removeTempDirectory,
  writeProject
} from '../helpers/project';

let sandbox: string;
let projectRoot: string;

function bunTool(enabled = true): ToolDefinition {
  return {
    name: 'bun_echo',
    description: 'Echo with Bun',
    enabled,
    runtime: 'bun',
    entrypoint: './tools/bun_echo.ts',
    timeoutMs: 5_000,
    maxOutputBytes: 1024 * 1024,
    arguments: {
      text: {
        type: 'string',
        required: true
      }
    }
  };
}

beforeEach(() => {
  closeDatabase();
  sandbox = createTempDirectory('modern-mcp-forge-tool-service-');
  projectRoot = join(sandbox, 'project');
  process.env.MCP_FORGE_DB_PATH = join(sandbox, 'forge.db');

  const tool = bunTool();
  const manifestPath = writeProject(
    projectRoot,
    createManifest({ tools: [tool] })
  );

  mkdirSync(join(projectRoot, 'tools'), { recursive: true });
  writeFileSync(
    join(projectRoot, 'tools', 'bun_echo.ts'),
    `
      const request = JSON.parse(await Bun.stdin.text());
      console.error('service diagnostic');
      process.stdout.write(JSON.stringify({
        protocolVersion: 1,
        status: 'ok',
        result: {
          content: [{ type: 'text', text: request.arguments.text }],
          structuredContent: { echoed: request.arguments.text }
        }
      }));
    `,
    'utf8'
  );

  selectProjectForProcess(manifestPath);
});

afterEach(() => {
  clearProjectForProcess();
  closeDatabase();
  delete process.env.MCP_FORGE_DB_PATH;
  removeTempDirectory(sandbox);
});

describe('tool execution service', () => {
  test('executes an enabled tool by name and stores a successful history row', async () => {
    const outcome = await executeToolByName('bun_echo', { text: 'hello' });

    expect(outcome.status).toBe('succeeded');
    expect(outcome.result.content[0]).toMatchObject({
      type: 'text',
      text: 'hello'
    });
    expect(outcome.result.structuredContent).toEqual({ echoed: 'hello' });
    expect(outcome.stderr).toContain('service diagnostic');
    expect(outcome.exitCode).toBe(0);

    const history = getExecution(outcome.databaseId);
    expect(history?.status).toBe('succeeded');
    expect(history?.executionUid).toBe(outcome.executionId);
  });

  test('returns an MCP error result and stores failure history when the tool process fails', async () => {
    const definition: ToolDefinition = {
      ...bunTool(),
      name: 'failure',
      entrypoint: './tools/failure.ts'
    };

    writeFileSync(
      join(projectRoot, 'tools', 'failure.ts'),
      `console.error('boom'); process.exit(4);`,
      'utf8'
    );

    const outcome = await executeToolDefinition(definition, {});

    expect(outcome.status).toBe('failed');
    expect(outcome.result.isError).toBe(true);
    expect(outcome.result.content[0].type).toBe('text');
    expect(outcome.exitCode).toBe(4);
    expect(outcome.stderr).toContain('boom');
    expect(getExecution(outcome.databaseId)?.status).toBe('failed');
  });

  test('rejects unknown tool names', async () => {
    await expect(
      executeToolByName('missing', {})
    ).rejects.toBeInstanceOf(ToolNotFoundError);
  });

  test('rejects disabled tools by name', async () => {
    const manifestPath = writeProject(
      projectRoot,
      createManifest({ tools: [bunTool(false)] })
    );
    selectProjectForProcess(manifestPath);

    await expect(
      executeToolByName('bun_echo', { text: 'hello' })
    ).rejects.toBeInstanceOf(ToolNotFoundError);
  });
});
