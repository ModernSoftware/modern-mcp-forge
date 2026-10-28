/** Dependency-free handlers implementing MCPack's native worker ABI. */
export function nativeStarter(id: string, runtime: 'node' | 'python') {
  const module = runtime === 'node' ? 'handlers.mjs' : 'handlers.py';
  const code =
    runtime === 'node'
      ? `export function createWorker(context) {
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
`
      : `def create_worker(context):
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
  return {
    module,
    code,
    manifest: {
      schemaVersion: 1,
      name: id,
      version: '1.0.0',
      workers: { main: { runtime, module: `./${module}` } },
      tools: [
        {
          name: `${id}_greet`,
          worker: 'main',
          handler: 'greet',
          inputSchema: {
            type: 'object',
            properties: { name: { type: 'string', minLength: 1 } },
            required: ['name'],
            additionalProperties: false
          }
        }
      ],
      resources: [
        {
          name: `${id}_guide`,
          uri: `mcpack://${id}/guide`,
          worker: 'main',
          handler: 'guide',
          mimeType: 'text/plain'
        }
      ],
      prompts: [
        {
          name: `${id}_welcome`,
          worker: 'main',
          handler: 'welcome',
          arguments: [{ name: 'name', required: true }]
        }
      ]
    }
  };
}

/** A blank, single-capability worker, not the separate demonstration source. */
export function capabilityStarter(
  id: string,
  runtime: 'node' | 'python',
  kind: 'tools' | 'resources' | 'prompts',
  name: string
): ReturnType<typeof nativeStarter> {
  const starter = nativeStarter(id, runtime);
  const quoted = JSON.stringify(name);
  const pythonName = `handle_${name.replaceAll('-', '_')}`;
  const result =
    kind === 'tools'
      ? `{ "isError": true, "content": [{ "type": "text", "text": "Not implemented yet. Edit this handler in the Code tab." }] }`
      : kind === 'resources'
        ? `{ "contents": [{ "uri": args.uri, "mimeType": "text/plain", "text": "Not implemented yet." }] }`
        : `{ "messages": [{ "role": "user", "content": { "type": "text", "text": "Not implemented yet." } }] }`;
  const code =
    runtime === 'node'
      ? `export function createWorker(context) {\n  // Initialize shared dependencies here. Import services from other modules as needed.\n  return {\n    ${kind}: {\n      async [${quoted}](args, call) {\n        call.signal.throwIfAborted();\n        // Implement ${name} using args and your application services.\n        return ${result};\n      }\n    }\n  };\n}\n`
      : `def create_worker(context):\n    # Initialize shared dependencies here; import your application services as needed.\n    def ${pythonName}(args, call):\n        call.signal.throw_if_aborted()\n        # Implement ${name} using args and your application services.\n        return ${result.replace('true', 'True').replace('args.uri', 'args["uri"]')}\n\n    return {"${kind}": {${quoted}: ${pythonName}}}\n`;
  const definition = { ...starter.manifest[kind][0], name, handler: name };
  if (kind === 'tools')
    Object.assign(definition, {
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false
      }
    });
  if (kind === 'prompts') Object.assign(definition, { arguments: [] });
  return {
    ...starter,
    code,
    manifest: {
      ...starter.manifest,
      tools: [],
      resources: [],
      prompts: [],
      [kind]: [definition]
    }
  } as ReturnType<typeof nativeStarter>;
}
