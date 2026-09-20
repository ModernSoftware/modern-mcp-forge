import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { createForgeMcpServer } from '$lib/server/mcp/server';

/**
 * Serve the same Forge MCP server factory used by Streamable HTTP over the
 * standard MCP stdio transport. The stdio launcher selects the project for
 * this process before invoking the server.
 */
export async function serveForgeMcpStdio(): Promise<void> {
  await serveStdio(() => createForgeMcpServer());
}
