import { createMcpHandler } from '@modelcontextprotocol/server';
import { createForgeMcpServer } from '$lib/server/mcp/server';

import { nativeProjects } from '$lib/server/mcpack/session';
import { createNativeMcpServer } from '$lib/server/mcpack/server';

export const forgeMcpHandler = createMcpHandler(() =>
  nativeProjects.selected() ? createNativeMcpServer() : createForgeMcpServer()
);
