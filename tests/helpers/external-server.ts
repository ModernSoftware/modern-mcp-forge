import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

export function externalServer(
  options: {
    token?: string;
    repeatedCursor?: boolean;
    paginated?: boolean;
    toolsOnly?: boolean;
  } = {}
) {
  const calls: Array<{
    method: string;
    name?: string;
    authorization: string | null;
  }> = [];
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: 'external-fixture', version: '1' });
    server.registerTool(
      'lookup',
      {
        description: 'Find an order',
        inputSchema: z.object({ filter: z.object({ id: z.string() }) }),
        annotations: { readOnlyHint: true }
      },
      async ({ filter }) => ({
        content: [
          { type: 'text', text: `Order ${filter.id}` },
          { type: 'resource_link', name: 'invoice', uri: 'support://invoice' }
        ]
      })
    );
    if (!options.toolsOnly) {
      server.registerResource(
        'invoice',
        'support://invoice',
        { mimeType: 'text/plain' },
        async (uri) => ({
          contents: [
            { uri: uri.href, mimeType: 'text/plain', text: 'Invoice contents' }
          ]
        })
      );
      server.registerPrompt(
        'review',
        { argsSchema: z.object({ customer: z.string() }) },
        async ({ customer }) => ({
          messages: [
            {
              role: 'user',
              content: { type: 'text', text: `Review ${customer}` }
            }
          ]
        })
      );
    }
    if (options.paginated || options.repeatedCursor) {
      server.server.setRequestHandler('tools/list', async (request) => ({
        tools: [
          {
            name: request.params?.cursor ? 'second' : 'first',
            inputSchema: { type: 'object' }
          }
        ],
        ...(!request.params?.cursor || options.repeatedCursor
          ? { nextCursor: 'next' }
          : {})
      }));
    }
    return server;
  });
  const http = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const authorization = request.headers.get('authorization');
      if (options.token && authorization !== `Bearer ${options.token}`)
        return new Response(`Unauthorized: ${options.token}`, { status: 401 });
      if (request.method === 'POST') {
        const body = (await request.clone().json()) as any;
        calls.push({
          method: body.method,
          name: body.params?.name ?? body.params?.uri,
          authorization
        });
      }
      return handler.fetch(request);
    }
  });
  return {
    url: `http://127.0.0.1:${http.port}/mcp`,
    calls,
    close: () => http.stop(true)
  };
}
