import { Server, ProtocolError } from '@modelcontextprotocol/server';
import { nativeProjects, NativeProjectError, type NativeProjectManager } from './session';

/** Forward native results and schemas without reauthoring them in Forge's ABI. */
export function createNativeMcpServer(manager: NativeProjectManager = nativeProjects) {
  const connection = manager.connection();
  const server = new Server(
    { name: connection.name, version: '0.10.0' },
    {
      capabilities: { tools: {}, resources: {}, prompts: {} }
    }
  );
  async function forward<T>(operation: () => Promise<T>): Promise<T> {
    try {
      connection.assertReady();
      return await operation();
    } catch (error) {
      if (NativeProjectError.is(error)) throw new ProtocolError(-32603, error.message);
      throw error;
    }
  }
  server.setRequestHandler('tools/list', () =>
    forward(async () => ({ tools: connection.catalog.tools }))
  );
  server.setRequestHandler('resources/list', () =>
    forward(async () => ({ resources: connection.catalog.resources }))
  );
  server.setRequestHandler('prompts/list', () =>
    forward(async () => ({ prompts: connection.catalog.prompts }))
  );
  server.setRequestHandler('resources/templates/list', () =>
    forward(async () => ({ resourceTemplates: [] }))
  );
  server.setRequestHandler('tools/call', (request, context) =>
    forward(() =>
      connection.client.callTool(request.params, {
        signal: context.mcpReq.signal,
        timeout: 300_000
      })
    )
  );
  server.setRequestHandler('resources/read', (request, context) =>
    forward(() =>
      connection.client.readResource(request.params, {
        signal: context.mcpReq.signal,
        timeout: 300_000
      })
    )
  );
  server.setRequestHandler('prompts/get', (request, context) =>
    forward(() =>
      connection.client.getPrompt(request.params, {
        signal: context.mcpReq.signal,
        timeout: 300_000
      })
    )
  );
  return server;
}
