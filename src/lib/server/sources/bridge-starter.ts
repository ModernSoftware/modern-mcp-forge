import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { containedFile } from './authoring';
import { NativeProjectError } from '../mcpack/session';
import type { RegisteredProject } from '../projects/project-service';
import { sourceId } from './schema';

const nodeServer = `import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

const server = new McpServer({ name: 'inventory', version: '1.0.0' });

server.registerTool('stock', { inputSchema: z.object({ sku: z.string() }) }, async ({ sku }) => ({
  content: [{ type: 'text', text: sku === 'DEMO' ? '12' : '0' }]
}));

server.registerResource('guide', 'inventory://guide', { mimeType: 'text/plain' }, async (uri) => ({
  contents: [{ uri: uri.href, text: 'Use DEMO to try the stock tool.' }]
}));

server.registerPrompt('review_stock', { argsSchema: z.object({ sku: z.string() }) }, async ({ sku }) => ({
  messages: [{ role: 'user', content: { type: 'text', text: 'Review stock for ' + sku } }]
}));

await server.connect(new StdioServerTransport());
`;

const pythonServer = `from mcp.server.fastmcp import FastMCP

server = FastMCP("shipping")


@server.tool()
def shipping_days(region: str) -> int:
    """Return the example delivery estimate in days."""
    return 2 if region == "local" else 5


@server.resource("shipping://guide", name="guide")
def guide() -> str:
    return "Use local to try the shipping estimate."


@server.prompt()
def review_shipping(region: str) -> str:
    return f"Review shipping for {region}"


if __name__ == "__main__":
    server.run(transport="stdio")
`;

export function createBridgeStarter(
  project: RegisteredProject,
  id: string,
  runtime: 'node' | 'python'
) {
  sourceId.parse(id);
  mkdirSync(join(project.path, 'bridges'), { recursive: true });
  const folder = join(containedFile(project.path, 'bridges'), id);
  try {
    mkdirSync(folder);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new NativeProjectError(
        'That bridge folder already exists. Attach its entrypoint or choose a different name.',
        409
      );
    throw error;
  }
  const filename = runtime === 'node' ? 'server.mjs' : 'server.py';
  try {
    if (runtime === 'node') {
      const pkg = {
        private: true,
        type: 'module',
        dependencies: { '@modelcontextprotocol/server': '2.0.0', zod: '4.6.5' }
      };
      writeFileSync(
        join(folder, 'package.json'),
        JSON.stringify(pkg, null, 2) + '\n',
        { flag: 'wx' }
      );
    } else {
      writeFileSync(join(folder, 'requirements.txt'), 'mcp==1.29.0\n', {
        flag: 'wx'
      });
    }
    writeFileSync(
      join(folder, filename),
      runtime === 'node' ? nodeServer : pythonServer,
      { flag: 'wx' }
    );
    return { entrypoint: `bridges/${id}/${filename}` };
  } catch (error) {
    rmSync(folder, { recursive: true, force: true });
    throw error;
  }
}
