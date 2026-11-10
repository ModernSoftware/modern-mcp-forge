import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { wire } from './client.mjs';

export default await wire(
  new StdioClientTransport({
    command: process.execPath,
    args: ['server.mjs'],
    cwd: process.cwd(),
    stderr: 'inherit'
  }),
  { versionNegotiation: { mode: { pin: '2026-07-28' } } }
);
