import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  Client,
  StreamableHTTPClientTransport
} from '@modelcontextprotocol/client';
import {
  createServer,
  type ViteDevServer
} from 'vite';

import {
  createTempDirectory,
  removeTempDirectory
} from '../helpers/project';
import {
  getAvailablePort,
  waitForHttp
} from '../helpers/network';

let sandbox: string;
let port: number;
let baseUrl: string;
let viteServer: ViteDevServer | null = null;
let previousDatabasePath: string | undefined;

async function jsonFetch(
  path: string,
  init?: RequestInit
): Promise<{ response: Response; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function postJson(path: string, body: unknown) {
  return jsonFetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

beforeEach(async () => {
  sandbox = createTempDirectory('modern-mcp-forge-http-e2e-');
  port = await getAvailablePort();
  baseUrl = `http://127.0.0.1:${port}`;

  previousDatabasePath = process.env.MCP_FORGE_DB_PATH;
  process.env.MCP_FORGE_DB_PATH = join(sandbox, 'forge.db');

  /*
   * Run Vite in-process rather than spawning `bun run dev`.
   *
   * This is substantially more reliable on Windows/Git Bash because it
   * removes package-script argument forwarding and child-process startup from
   * the E2E test. It also means a Vite startup failure is reported directly
   * instead of being hidden behind a health-check timeout.
   */
  viteServer = await createServer({
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true
    },
    logLevel: 'error'
  });

  await viteServer.listen();
  await waitForHttp(`${baseUrl}/api/health`);
}, 30_000);

afterEach(async () => {
  if (viteServer) {
    /*
     * SQLite is opened by the Vite SSR module graph. Close the same module
     * instance before shutting Vite down so Windows can remove the temporary
     * database directory without leaving file handles behind.
     */
    try {
      const databaseModule = await viteServer.ssrLoadModule(
        '/src/lib/server/database.ts'
      );

      databaseModule.closeDatabase?.();
    } catch {
      // Cleanup should continue even if the server never finished starting.
    }

    try {
      const projectSelectionModule = await viteServer.ssrLoadModule(
        '/src/lib/server/project/project-selection.ts'
      );

      projectSelectionModule.clearProjectForProcess?.();
    } catch {
      // Best-effort process-state cleanup.
    }

    await viteServer.close();
    viteServer = null;
  }

  if (previousDatabasePath === undefined) {
    delete process.env.MCP_FORGE_DB_PATH;
  } else {
    process.env.MCP_FORGE_DB_PATH = previousDatabasePath;
  }

  removeTempDirectory(sandbox);
}, 30_000);

describe('HTTP application and MCP end-to-end', () => {
  test('covers project lifecycle, authoring, execution, MCP, lifecycle mutations, and no-project behavior', async () => {
    const health = await jsonFetch('/api/health');
    expect(health.response.status).toBe(200);
    expect(health.body.status).toBe('ok');

    const initialStatus = await jsonFetch('/api/projects/status');
    expect(initialStatus.body.active).toBe(false);

    const noProjectMcp = await fetch(`${baseUrl}/mcp`);
    expect(noProjectMcp.status).toBe(503);

    const blockedOrigin = await fetch(`${baseUrl}/api/projects/status`, {
      headers: {
        origin: 'https://evil.example'
      }
    });
    expect(blockedOrigin.status).toBe(403);

    const folder = await postJson('/api/filesystem/directories/create', {
      parentPath: sandbox,
      name: 'http-project'
    });
    expect(folder.response.status).toBe(201);
    const projectPath = folder.body.path as string;

    const duplicateFolder = await postJson('/api/filesystem/directories/create', {
      parentPath: sandbox,
      name: 'http-project'
    });
    expect(duplicateFolder.response.status).toBe(409);

    const invalidFolder = await postJson('/api/filesystem/directories/create', {
      parentPath: sandbox,
      name: '../escape'
    });
    expect(invalidFolder.response.status).toBe(400);

    const created = await postJson('/api/projects/create', {
      folderPath: projectPath,
      name: 'HTTP Project',
      description: 'E2E project'
    });
    expect(created.response.status).toBe(201);
    expect(created.body.project.name).toBe('HTTP Project');
    expect(existsSync(join(projectPath, 'forge.project.json'))).toBe(true);

    const duplicateProject = await postJson('/api/projects/create', {
      folderPath: projectPath
    });
    expect(duplicateProject.response.status).toBe(409);

    const toolDefinition = {
      name: 'http_echo',
      title: 'HTTP Echo',
      description: 'Echo through Bun',
      enabled: true,
      runtime: 'bun',
      entrypoint: './tools/http_echo.ts',
      timeoutMs: 5000,
      maxOutputBytes: 1048576,
      arguments: {
        text: {
          type: 'string',
          required: true
        }
      }
    };

    const tool = await postJson('/api/project/tools', toolDefinition);
    expect(tool.response.status).toBe(201);

    const duplicateTool = await postJson('/api/project/tools', toolDefinition);
    expect(duplicateTool.response.status).toBe(409);

    const toolSource = await fetch(`${baseUrl}/api/project/tools/http_echo/source`, {
      method: 'POST'
    });
    expect(toolSource.status).toBe(201);

    const resourceDefinition = {
      name: 'guide',
      title: 'Guide',
      description: 'E2E guide',
      enabled: true,
      uri: 'forge://guide',
      mimeType: 'text/markdown',
      source: './resources/guide.md'
    };

    const resource = await postJson('/api/project/resources', resourceDefinition);
    expect(resource.response.status).toBe(201);

    const resourceSource = await fetch(`${baseUrl}/api/project/resources/guide/source`, {
      method: 'POST'
    });
    expect(resourceSource.status).toBe(201);

    const promptDefinition = {
      name: 'review',
      title: 'Review',
      description: 'E2E prompt',
      enabled: true,
      role: 'user',
      template: './prompts/review.md',
      arguments: {
        language: {
          required: true,
          description: 'Language'
        }
      }
    };

    const prompt = await postJson('/api/project/prompts', promptDefinition);
    expect(prompt.response.status).toBe(201);

    const promptSource = await fetch(`${baseUrl}/api/project/prompts/review/source`, {
      method: 'POST'
    });
    expect(promptSource.status).toBe(201);

    const directExecution = await postJson('/api/tools/http_echo/execute', {
      arguments: {
        text: 'direct execution'
      }
    });
    expect(directExecution.response.status).toBe(200);
    expect(directExecution.body.status).toBe('succeeded');
    expect(directExecution.body.result.structuredContent.arguments.text).toBe('direct execution');

    const client = new Client(
      {
        name: 'http-e2e-client',
        version: '1.0.0'
      },
      {
        versionNegotiation: {
          mode: 'auto'
        }
      }
    );

    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`))
      );

      expect((await client.listTools()).tools.map((item) => item.name)).toContain('http_echo');
      expect((await client.listResources()).resources.map((item) => item.name)).toContain('guide');
      expect((await client.listPrompts()).prompts.map((item) => item.name)).toContain('review');

      const call = await client.callTool({
        name: 'http_echo',
        arguments: {
          text: 'mcp execution'
        }
      });
      expect(call.isError).not.toBe(true);
      expect(call.structuredContent).toMatchObject({
        arguments: {
          text: 'mcp execution'
        }
      });

      const resourceRead = await client.readResource({
        uri: 'forge://guide'
      });
      expect(resourceRead.contents).toHaveLength(1);

      const promptRead = await client.getPrompt({
        name: 'review',
        arguments: {
          language: 'TypeScript'
        }
      });
      expect(promptRead.messages).toHaveLength(1);
      expect((promptRead.messages[0].content as any).text).toContain('TypeScript');
    } finally {
      await client.close().catch(() => undefined);
    }

    const runtimeChange = await fetch(`${baseUrl}/api/project/definitions/tool/http_echo`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        ...toolDefinition,
        runtime: 'python',
        entrypoint: './tools/http_echo.py'
      })
    });
    expect(runtimeChange.status).toBe(400);

    const disable = await fetch(`${baseUrl}/api/project/definitions/tool/http_echo`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ enabled: false })
    });
    expect(disable.status).toBe(200);

    const disabledExecution = await postJson('/api/tools/http_echo/execute', {
      arguments: {
        text: 'should fail'
      }
    });
    expect(disabledExecution.response.status).toBe(404);

    const enable = await fetch(`${baseUrl}/api/project/definitions/tool/http_echo`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ enabled: true })
    });
    expect(enable.status).toBe(200);

    const deleteResource = await fetch(`${baseUrl}/api/project/definitions/resource/guide`, {
      method: 'DELETE'
    });
    expect(deleteResource.status).toBe(200);
    expect(existsSync(join(projectPath, 'resources', 'guide.md'))).toBe(true);

    const close = await fetch(`${baseUrl}/api/projects/close`, {
      method: 'POST'
    });
    expect(close.status).toBe(200);

    const closedStatus = await jsonFetch('/api/projects/status');
    expect(closedStatus.body.active).toBe(false);

    const toolsPage = await fetch(`${baseUrl}/tools`, {
      redirect: 'manual'
    });
    expect(toolsPage.status).toBe(303);
    expect(toolsPage.headers.get('location')).toBe('/projects');

    const reopen = await postJson('/api/projects/open', {
      folderPath: projectPath
    });
    expect(reopen.response.status).toBe(200);
    expect(reopen.body.project.name).toBe('HTTP Project');
  }, 30_000);
});
