// Copy into the Forge project as bridges/<name>/adapter.mjs.
// The application root contains application.mjs and its own dependencies.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const app = await import(pathToFileURL(resolve('application.mjs')).href);

export default {
  listTools() {
    return Array.from(app.actions, ([name, action]) => ({
      name,
      description: action.help,
      inputSchema: action.parameters
    }));
  },
  async callTool({ name, arguments: args }, { signal }) {
    const value = await app.actions.get(name).run(args, { signal });
    return {
      ...(value.error && { isError: true }),
      content: [{ type: 'text', text: JSON.stringify(value) }]
    };
  },
  listResources() {
    return Array.from(app.documents.keys(), (uri) => ({ name: uri, uri }));
  },
  readResource({ uri }) {
    return { contents: [{ uri, text: app.documents.get(uri) }] };
  },
  listPrompts() {
    return Array.from(app.templates.keys(), (name) => ({
      name,
      arguments: [{ name: 'sku', required: true }]
    }));
  },
  getPrompt({ name, arguments: args }) {
    return {
      messages: [
        {
          role: 'user',
          content: { type: 'text', text: app.templates.get(name)(args.sku) }
        }
      ]
    };
  }
};
