import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { wire } from './client.mjs';

const { server } = await import(pathToFileURL(resolve('application.mjs')).href);
// Use MCP Framework's public serverless Request/Response dispatcher in process.
const transport = new StreamableHTTPClientTransport(
  new URL('http://localhost/mcp'),
  {
    fetch: (url, init) => server.handleRequest(new Request(url, init))
  }
);
export default await wire(transport, {
  versionNegotiation: { mode: 'legacy' }
});
