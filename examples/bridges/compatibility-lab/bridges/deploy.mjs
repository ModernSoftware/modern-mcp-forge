import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { wire } from './client.mjs';

// xmcp's compiler generates this executable from the application's tool files.
export default await wire(
  new StdioClientTransport({
    command: process.execPath,
    args: ['dist/stdio.js'],
    cwd: process.cwd(),
    stderr: 'inherit'
  })
);
