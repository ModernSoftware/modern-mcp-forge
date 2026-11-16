import { Client } from '@modelcontextprotocol/client';

// Keep the application's public MCP schema, errors, pagination and cancellation semantics.
export async function wire(transport, options) {
  const client = new Client(
    { name: 'compatibility-lab', version: '1.0.0' },
    options
  );
  let closing;
  const close = () => {
    closing ??= transport.close();
    return closing;
  };
  process.stdin.once('end', close);
  process.stdin.once('close', close);
  try {
    await client.connect(transport, { timeout: 10000 });
  } catch (error) {
    await close();
    throw error;
  }
  const forward =
    (method) =>
    (params, { signal }) =>
      client.request({ method, params }, { signal, timeout: 15000 });
  const capabilities = client.getServerCapabilities();
  return {
    ...(capabilities.tools && {
      listTools: forward('tools/list'),
      callTool: forward('tools/call')
    }),
    ...(capabilities.resources && {
      listResources: forward('resources/list'),
      readResource: forward('resources/read')
    }),
    ...(capabilities.prompts && {
      listPrompts: forward('prompts/list'),
      getPrompt: forward('prompts/get')
    })
  };
}
