import { McpServer } from '@modelcontextprotocol/server';
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
