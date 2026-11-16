// Forge owns the stdio server. Only the adapter is loaded from the project.
import { pathToFileURL } from 'node:url';
import { Server } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

const [, applicationRoot] = process.argv.splice(1, 2);
const adapter = (await import(pathToFileURL(process.argv[1]).href)).default;
const groups = [
  ['tools', 'listTools', 'callTool', 'tools/call'],
  ['resources', 'listResources', 'readResource', 'resources/read'],
  ['prompts', 'listPrompts', 'getPrompt', 'prompts/get']
];
const capabilities = {};
for (const [group, list, invoke] of groups) {
  if (adapter?.[list] === undefined && adapter?.[invoke] === undefined)
    continue;
  if (
    typeof adapter[list] !== 'function' ||
    typeof adapter[invoke] !== 'function'
  )
    throw new TypeError(
      'FORGE_BRIDGE_INVALID_HOOKS: provide both hooks in each capability group.'
    );
  capabilities[group] = {};
}
if (!Object.keys(capabilities).length)
  throw new TypeError(
    'FORGE_BRIDGE_INVALID_HOOKS: export a default adapter with at least one hook pair.'
  );

const server = new Server(
  { name: 'forge-node-adapter', version: '1' },
  { capabilities }
);
for (const [group, list, invoke, method] of groups) {
  if (!capabilities[group]) continue;
  server.setRequestHandler(group + '/list', async ({ params }, context) => {
    const value = await adapter[list](params ?? {}, {
      applicationRoot,
      signal: context.mcpReq.signal
    });
    return Array.isArray(value) ? { [group]: value } : value;
  });
  server.setRequestHandler(method, ({ params }, context) =>
    adapter[invoke](params, { applicationRoot, signal: context.mcpReq.signal })
  );
}
await server.connect(new StdioServerTransport());
