import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import { closeDatabase } from '$lib/server/database';
import {
  clearProjectForProcess,
  selectProjectForProcess
} from '$lib/server/project/project-selection';
import { handle } from '../../src/hooks.server';

import {
  createManifest,
  createTempDirectory,
  removeTempDirectory,
  writeProject
} from '../helpers/project';

let sandbox: string;

async function invoke(path: string) {
  return handle({
    event: {
      url: new URL(`http://localhost:5173${path}`)
    } as any,
    resolve: async () => new Response('resolved', { status: 200 })
  } as any);
}

beforeEach(() => {
  closeDatabase();
  clearProjectForProcess();
  sandbox = createTempDirectory('modern-mcp-forge-hooks-');
  process.env.MCP_FORGE_DB_PATH = join(sandbox, 'forge.db');
});

afterEach(() => {
  clearProjectForProcess();
  closeDatabase();
  delete process.env.MCP_FORGE_DB_PATH;
  removeTempDirectory(sandbox);
});

describe('SvelteKit project-state hook', () => {
  test('returns 503 for MCP when no project is active', async () => {
    const response = await invoke('/mcp');
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: 'no_active_project'
    });
  });

  test('returns 409 for project-bound APIs when no project is active', async () => {
    const response = await invoke('/api/project/tools');
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: 'no_active_project'
    });
  });

  test('redirects project pages when no project is active', async () => {
    try {
      await invoke('/tools');
      throw new Error('Expected redirect.');
    } catch (error: any) {
      expect(error?.status).toBe(303);
      expect(error?.location).toBe('/projects');
    }
  });

  test('allows non-project APIs without an active project', async () => {
    const response = await invoke('/api/projects/status');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('resolved');
  });

  test('allows project routes when a process project is selected', async () => {
    const projectRoot = join(sandbox, 'project');
    selectProjectForProcess(writeProject(projectRoot, createManifest()));

    expect((await invoke('/tools')).status).toBe(200);
    expect((await invoke('/mcp')).status).toBe(200);
    expect((await invoke('/api/project/tools')).status).toBe(200);
  });
});
