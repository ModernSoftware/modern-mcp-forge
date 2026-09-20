import { createMcpHandler } from '@modelcontextprotocol/server';
import { createForgeMcpServer } from '$lib/server/mcp/server';

export const forgeMcpHandler = createMcpHandler(() => createForgeMcpServer());
