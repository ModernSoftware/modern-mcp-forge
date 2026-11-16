import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { containedFile } from './authoring';
import { NativeProjectError } from '../mcpack/session';
import type { RegisteredProject } from '../projects/project-service';
import { sourceId } from './schema';

// The editable module contains only integration code. Forge supplies the MCP host.
const nodeAdapter = `// Import your application's registry or dispatcher here.
export default {
  async listTools(params, { applicationRoot }) {
    // Return your registry's tool definitions, including their original inputSchema.
    return [];
  },
  async callTool({ name, arguments: args }, { signal }) {
    // Delegate to your application's dispatcher and return its MCP result.
    throw new Error("Wire callTool to your application.");
  },
  async listResources() { return []; },
  async readResource({ uri }, context) {
    throw new Error("Wire readResource to your application.");
  },
  async listPrompts() { return []; },
  async getPrompt({ name, arguments: args }, context) {
    throw new Error("Wire getPrompt to your application.");
  }
};
`;

const pythonAdapter = `"""Wire these hooks to your application's existing registry or dispatcher."""


async def list_tools(params, context):
    # Return the registry's tool definitions, including their original inputSchema.
    return []


async def call_tool(params, context):
    # Forward params["name"] and params.get("arguments", {}) to your application.
    raise NotImplementedError("Wire call_tool to your application.")


async def list_resources(params, context):
    return []


async def read_resource(params, context):
    raise NotImplementedError("Wire read_resource to your application.")


async def list_prompts(params, context):
    return []


async def get_prompt(params, context):
    raise NotImplementedError("Wire get_prompt to your application.")
`;

export function createBridgeStarter(
  project: RegisteredProject,
  id: string,
  runtime: 'node' | 'python'
) {
  sourceId.parse(id);
  mkdirSync(join(project.path, 'bridges'), { recursive: true });
  const folder = join(containedFile(project.path, 'bridges'), id);
  try {
    mkdirSync(folder);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new NativeProjectError(
        'That bridge folder already exists. Select its adapter file or choose a different name.',
        409
      );
    throw error;
  }
  const filename = runtime === 'node' ? 'adapter.mjs' : 'adapter.py';
  try {
    writeFileSync(
      join(folder, '.gitignore'),
      '.venv/\n__pycache__/\nnode_modules/\n.env\n',
      { flag: 'wx' }
    );
    if (runtime === 'python') {
      writeFileSync(join(folder, 'requirements-forge.txt'), 'mcp>=1.29,<2\n', {
        flag: 'wx'
      });
    }
    writeFileSync(
      join(folder, filename),
      runtime === 'node' ? nodeAdapter : pythonAdapter,
      { flag: 'wx' }
    );
    return {
      mode: 'adapter' as const,
      entrypoint: `bridges/${id}/${filename}`
    };
  } catch (error) {
    rmSync(folder, { recursive: true, force: true });
    throw error;
  }
}
