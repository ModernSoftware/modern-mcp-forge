import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ToolProcessError } from '$lib/server/execution/errors';
import { executeExternalTool } from '$lib/server/execution/process-runner';
import {
  clearProjectForProcess,
  selectProjectForProcess
} from '$lib/server/project/project-selection';
import type { ToolDefinition } from '$lib/server/project/schema';

import {
  createManifest,
  createTempDirectory,
  removeTempDirectory,
  writeProject
} from '../helpers/project';

let root: string;

function tool(
  name: string,
  runtime: ToolDefinition['runtime'] = 'node',
  entrypoint = `./tools/${name}.mjs`,
  timeoutMs = 5_000
): ToolDefinition {
  return {
    name,
    enabled: true,
    description: '',
    runtime,
    entrypoint,
    timeoutMs,
    maxOutputBytes: 1024 * 1024,
    arguments: {}
  };
}

function writeTool(name: string, source: string, extension = 'mjs'): string {
  const directory = join(root, 'tools');
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${name}.${extension}`);
  writeFileSync(path, source, 'utf8');
  return path;
}

beforeEach(() => {
  root = createTempDirectory('modern-mcp-forge-runner-');
  selectProjectForProcess(writeProject(root, createManifest()));
});

afterEach(() => {
  clearProjectForProcess();
  removeTempDirectory(root);
});

describe('external tool process runner', () => {
  test('executes a valid Node Forge Tool ABI program', async () => {
    if (!Bun.which('node')) return;

    writeTool('success', `
      let raw = '';
      process.stdin.setEncoding('utf8');
      for await (const chunk of process.stdin) raw += chunk;
      const request = JSON.parse(raw);
      console.error('node diagnostic');
      process.stdout.write(JSON.stringify({
        protocolVersion: 1,
        status: 'ok',
        result: {
          content: [{ type: 'text', text: request.arguments.text }],
          structuredContent: {
            executionId: request.executionId,
            projectRoot: request.context.projectRoot
          }
        }
      }));
    `);

    const result = await executeExternalTool(
      tool('success'),
      { text: 'hello' },
      'execution-123'
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('node diagnostic');
    expect(result.result.content[0].text).toBe('hello');
    expect(result.result.structuredContent).toMatchObject({
      executionId: 'execution-123',
      projectRoot: root
    });
  });

  test('honors a tool-specific working directory', async () => {
    if (!Bun.which('node')) return;

    const subdirectory = join(root, 'tools', 'working');
    mkdirSync(subdirectory, { recursive: true });
    writeFileSync(join(subdirectory, 'cwd.mjs'), `
      process.stdin.resume();
      process.stdin.on('end', () => {
        process.stdout.write(JSON.stringify({
          protocolVersion: 1,
          status: 'ok',
          result: {
            content: [{ type: 'text', text: process.cwd() }]
          }
        }));
      });
    `, 'utf8');

    const definition = {
      ...tool('cwd', 'node', './tools/working/cwd.mjs'),
      cwd: './tools/working'
    };

    const result = await executeExternalTool(definition, {}, 'cwd-execution');
    expect(realpathSync(result.result.content[0].text)).toBe(realpathSync(subdirectory));
  });

  test('passes Forge execution environment variables to child tools', async () => {
    if (!Bun.which('node')) return;

    writeTool('env', `
      process.stdin.resume();
      process.stdin.on('end', () => {
        process.stdout.write(JSON.stringify({
          protocolVersion: 1,
          status: 'ok',
          result: {
            content: [{ type: 'text', text: 'ok' }],
            structuredContent: {
              executionId: process.env.MCP_FORGE_EXECUTION_ID,
              toolName: process.env.MCP_FORGE_TOOL_NAME,
              abi: process.env.MCP_FORGE_ABI_VERSION
            }
          }
        }));
      });
    `);

    const result = await executeExternalTool(tool('env'), {}, 'abc-123');

    expect(result.result.structuredContent).toEqual({
      executionId: 'abc-123',
      toolName: 'env',
      abi: '1'
    });
  });

  test('executes a valid Bun Forge Tool ABI program', async () => {
    writeTool('bun_success', `
      const request = JSON.parse(await Bun.stdin.text());
      process.stdout.write(JSON.stringify({
        protocolVersion: 1,
        status: 'ok',
        result: {
          content: [{ type: 'text', text: String(request.arguments.value) }]
        }
      }));
    `, 'ts');

    const result = await executeExternalTool(
      tool('bun_success', 'bun', './tools/bun_success.ts'),
      { value: 42 },
      'bun-execution'
    );

    expect(result.result.content[0].text).toBe('42');
  });

  test('executes a valid Python Forge Tool ABI program when Python is available', async () => {
    const hasPython = Boolean(
      Bun.which('python') || Bun.which('python3') || Bun.which('py')
    );

    if (!hasPython) return;

    writeTool('python_success', `
import json
import sys
request = json.loads(sys.stdin.read())
sys.stdout.write(json.dumps({
    "protocolVersion": 1,
    "status": "ok",
    "result": {
        "content": [{"type": "text", "text": str(request["arguments"]["value"])}]
    }
}))
`, 'py');

    const result = await executeExternalTool(
      tool('python_success', 'python', './tools/python_success.py'),
      { value: 'python' },
      'python-execution'
    );

    expect(result.result.content[0].text).toBe('python');
  });

  test('rejects non-zero child exit codes and captures stderr', async () => {
    if (!Bun.which('node')) return;

    writeTool('exit_failure', `
      console.error('failure details');
      process.exit(7);
    `);

    try {
      await executeExternalTool(tool('exit_failure'), {}, 'execution');
      throw new Error('Expected tool execution to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolProcessError);
      expect((error as ToolProcessError).exitCode).toBe(7);
      expect((error as ToolProcessError).stderr).toContain('failure details');
    }
  });

  test('rejects empty stdout', async () => {
    if (!Bun.which('node')) return;

    writeTool('empty', `process.stdin.resume();`);

    await expect(
      executeExternalTool(tool('empty'), {}, 'execution')
    ).rejects.toThrow('no protocol response');
  });

  test('rejects logs mixed into stdout', async () => {
    if (!Bun.which('node')) return;

    writeTool('stdout_log', `
      process.stdout.write('debug log\\n');
      process.stdout.write(JSON.stringify({
        protocolVersion: 1,
        status: 'ok',
        result: { content: [{ type: 'text', text: 'ok' }] }
      }));
    `);

    await expect(
      executeExternalTool(tool('stdout_log'), {}, 'execution')
    ).rejects.toThrow('not a valid Forge Tool ABI JSON response');
  });

  test('rejects JSON that violates Forge Tool ABI', async () => {
    if (!Bun.which('node')) return;

    writeTool('bad_protocol', `
      process.stdout.write(JSON.stringify({ status: 'ok' }));
    `);

    await expect(
      executeExternalTool(tool('bad_protocol'), {}, 'execution')
    ).rejects.toThrow('does not satisfy Forge Tool ABI');
  });

  test('turns ABI error responses into ToolProcessError', async () => {
    if (!Bun.which('node')) return;

    writeTool('abi_error', `
      process.stdout.write(JSON.stringify({
        protocolVersion: 1,
        status: 'error',
        error: { code: 'CUSTOM_FAILURE', message: 'Tool refused' }
      }));
    `);

    await expect(
      executeExternalTool(tool('abi_error'), {}, 'execution')
    ).rejects.toThrow('CUSTOM_FAILURE: Tool refused');
  });

  test('enforces tool timeouts', async () => {
    if (!Bun.which('node')) return;

    writeTool('timeout', `
      setTimeout(() => {
        process.stdout.write(JSON.stringify({
          protocolVersion: 1,
          status: 'ok',
          result: { content: [{ type: 'text', text: 'too late' }] }
        }));
      }, 5000);
    `);

    await expect(
      executeExternalTool(tool('timeout', 'node', './tools/timeout.mjs', 100), {}, 'execution')
    ).rejects.toBeInstanceOf(ToolProcessError);
  }, 5_000);

  test('rejects dotnet execution until implemented', async () => {
    await expect(
      executeExternalTool(
        tool('dotnet_tool', 'dotnet', './tools/tool.dll'),
        {},
        'execution'
      )
    ).rejects.toThrow('.NET tool execution is not implemented');
  });
});
