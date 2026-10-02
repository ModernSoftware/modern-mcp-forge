/** Dependency-free handlers implementing MCPack's native worker ABI. */
export function nativeStarter(id: string, runtime: 'node' | 'python') {
  const module = runtime === 'node' ? 'handlers.mjs' : 'handlers.py';
  const code = runtime === 'node' ? `export function createWorker(context) {
  return {
    tools: {
      async greet({ name }) {
        return { content: [{ type: 'text', text: 'Hello, ' + name + '!' }] };
      }
    },
    resources: {
      async guide({ uri }) {
        return { contents: [{ uri, mimeType: 'text/plain', text: 'Your native MCPack guide.' }] };
      }
    },
    prompts: {
      async welcome({ name }) {
        return { messages: [{ role: 'user', content: { type: 'text', text: 'Welcome ' + name } }] };
      }
    }
  };
}
` : `def create_worker(context):
    def greet(args, call):
        return {"content": [{"type": "text", "text": "Hello, " + args["name"] + "!"}]}

    def guide(args, call):
        return {"contents": [{"uri": args["uri"], "mimeType": "text/plain", "text": "Your native MCPack guide."}]}

    def welcome(args, call):
        return {"messages": [{"role": "user", "content": {"type": "text", "text": "Welcome " + args["name"]}}]}

    return {
        "tools": {"greet": greet},
        "resources": {"guide": guide},
        "prompts": {"welcome": welcome},
    }
`;
  return { module, code, manifest: {
    schemaVersion: 1, name: id, version: '1.0.0',
    workers: { main: { runtime, module: `./${module}` } },
    tools: [{ name: `${id}_greet`, worker: 'main', handler: 'greet', inputSchema: {
      type: 'object', properties: { name: { type: 'string', minLength: 1 } }, required: ['name'], additionalProperties: false
    } }],
    resources: [{ name: `${id}_guide`, uri: `mcpack://${id}/guide`, worker: 'main', handler: 'guide', mimeType: 'text/plain' }],
    prompts: [{ name: `${id}_welcome`, worker: 'main', handler: 'welcome', arguments: [{ name: 'name', required: true }] }]
  } };
}
