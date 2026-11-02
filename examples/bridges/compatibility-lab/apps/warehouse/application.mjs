import { fileURLToPath } from 'node:url';
import { MCPServer } from 'mcp-framework';

export const server = new MCPServer({
  name: 'warehouse-allocation',
  version: '1.0.0',
  basePath: fileURLToPath(new URL('.', import.meta.url))
});
