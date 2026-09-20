import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';

import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep
} from 'node:path';

import { getProjectRoot, loadProjectManifest } from '$lib/server/project/loader';
import type { ToolDefinition } from '$lib/server/project/schema';

export class ToolSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolSourceError';
  }
}

export class ToolSourceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolSourceConflictError';
  }
}

export interface ToolSourceInfo {
  toolName: string;
  runtime: ToolDefinition['runtime'];
  declaredEntrypoint: string | null;
  resolvedPath: string | null;
  projectRelativePath: string | null;
  language: 'python' | 'typescript' | 'javascript' | 'plaintext';
  external: boolean;
  exists: boolean;
  editable: boolean;
}

function getTool(toolName: string): ToolDefinition {
  const manifest = loadProjectManifest();
  const tool = manifest.tools.find(
    (candidate) => candidate.name === toolName
  );

  if (!tool) {
    throw new ToolSourceError(`Tool "${toolName}" is not registered.`);
  }

  return tool;
}

function resolveSourcePath(tool: ToolDefinition): string {
  if (!tool.entrypoint) {
    throw new ToolSourceError(`Tool "${tool.name}" does not have a source entrypoint.`);
  }

  return isAbsolute(tool.entrypoint)
    ? resolve(tool.entrypoint)
    : resolve(getProjectRoot(), tool.entrypoint);
}

function isOutsideProject(path: string): boolean {
  const projectRoot = getProjectRoot();
  const relativePath = relative(projectRoot, path);

  return (
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  );
}

function languageForRuntime(runtime: ToolDefinition['runtime']): ToolSourceInfo['language'] {
  switch (runtime) {
    case 'python':
      return 'python';
    case 'bun':
      return 'typescript';
    case 'node':
      return 'javascript';
    default:
      return 'plaintext';
  }
}

export function getToolSourceInfo(toolName: string): ToolSourceInfo {
  const tool = getTool(toolName);

  const path = resolveSourcePath(tool);
  const external = isOutsideProject(path);

  return {
    toolName: tool.name,
    runtime: tool.runtime,
    declaredEntrypoint: tool.entrypoint ?? null,
    resolvedPath: path,
    projectRelativePath: external
      ? null
      : relative(getProjectRoot(), path),
    language: languageForRuntime(tool.runtime),
    external,
    exists: existsSync(path),
    editable:
      tool.runtime === 'python' ||
      tool.runtime === 'bun' ||
      tool.runtime === 'node'
  };
}

export function readToolSource(toolName: string): {
  info: ToolSourceInfo;
  content: string | null;
} {
  const info = getToolSourceInfo(toolName);

  if (!info.editable || !info.resolvedPath) {
    return {
      info,
      content: null
    };
  }

  if (!info.exists) {
    return {
      info,
      content: null
    };
  }

  return {
    info,
    content: readFileSync(info.resolvedPath, 'utf8')
  };
}

function starterTemplate(tool: ToolDefinition): string {
  if (tool.runtime === 'python') {
    return `import json
import sys
from typing import Any


def respond(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, separators=(",", ":")))
    sys.stdout.flush()


try:
    request = json.loads(sys.stdin.read())
    arguments = request.get("arguments", {})
    execution_id = request.get("executionId", "unknown")

    print(
        f"[{execution_id}] Executing ${tool.name}",
        file=sys.stderr,
    )

    # TODO: replace this starter result with your real tool implementation.
    result = {
        "message": "${tool.name} executed successfully.",
        "arguments": arguments,
    }

    respond(
        {
            "protocolVersion": 1,
            "status": "ok",
            "result": {
                "content": [
                    {
                        "type": "text",
                        "text": result["message"],
                    }
                ],
                "structuredContent": result,
            },
        }
    )
except Exception as exc:
    print(f"Tool failure: {exc}", file=sys.stderr)
    respond(
        {
            "protocolVersion": 1,
            "status": "error",
            "error": {
                "code": "TOOL_FAILURE",
                "message": str(exc),
            },
        }
    )
`;
  }

  if (tool.runtime === 'bun') {
    return `interface ForgeRequest {
  protocolVersion: 1;
  executionId: string;
  tool: {
    name: string;
  };
  arguments: Record<string, unknown>;
}

function respond(payload: unknown): void {
  process.stdout.write(JSON.stringify(payload));
}

try {
  const raw = await Bun.stdin.text();
  const request = JSON.parse(raw) as ForgeRequest;

  console.error(
    \`[\${request.executionId}] Executing ${tool.name}\`
  );

  // TODO: replace this starter result with your real tool implementation.
  const result = {
    message: '${tool.name} executed successfully.',
    arguments: request.arguments
  };

  respond({
    protocolVersion: 1,
    status: 'ok',
    result: {
      content: [
        {
          type: 'text',
          text: result.message
        }
      ],
      structuredContent: result
    }
  });
} catch (error) {
  console.error(error);

  respond({
    protocolVersion: 1,
    status: 'error',
    error: {
      code: 'TOOL_FAILURE',
      message: error instanceof Error ? error.message : String(error)
    }
  });
}
`;
  }

  if (tool.runtime === 'node') {
    return `function respond(payload) {
  process.stdout.write(JSON.stringify(payload));
}

async function readStdin() {
  let raw = '';
  process.stdin.setEncoding('utf8');

  for await (const chunk of process.stdin) {
    raw += chunk;
  }

  return raw;
}

async function main() {
  try {
    const raw = await readStdin();
    const request = JSON.parse(raw);

    console.error(
      \`[\${request.executionId}] Executing ${tool.name} with Node.js\`
    );

    // TODO: replace this starter result with your real tool implementation.
    const result = {
      message: '${tool.name} executed successfully with Node.js.',
      arguments: request.arguments
    };

    respond({
      protocolVersion: 1,
      status: 'ok',
      result: {
        content: [
          {
            type: 'text',
            text: result.message
          }
        ],
        structuredContent: result
      }
    });
  } catch (error) {
    console.error(error);

    respond({
      protocolVersion: 1,
      status: 'error',
      error: {
        code: 'TOOL_FAILURE',
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }
}

void main();
`;
  }

  throw new ToolSourceError(`Runtime "${tool.runtime}" does not have a starter template yet.`);
}

export function createStarterSource(toolName: string): {
  info: ToolSourceInfo;
  content: string;
} {
  const tool = getTool(toolName);
  const info = getToolSourceInfo(toolName);

  if (!info.editable || !info.resolvedPath) {
    throw new ToolSourceError(`Tool "${toolName}" does not support source-file authoring.`);
  }

  if (info.exists) {
    throw new ToolSourceConflictError(`Source file already exists at "${info.resolvedPath}".`);
  }

  mkdirSync(dirname(info.resolvedPath), {
    recursive: true
  });

  const content = starterTemplate(tool);

  writeFileSync(info.resolvedPath, content, {
    encoding: 'utf8',
    flag: 'wx'
  });

  return {
    info: {
      ...info,
      exists: true
    },
    content
  };
}

export function saveToolSource(
  toolName: string,
  content: string
): ToolSourceInfo {
  const info = getToolSourceInfo(toolName);

  if (!info.editable || !info.resolvedPath) {
    throw new ToolSourceError(`Tool "${toolName}" does not support source-file editing.`);
  }

  if (!info.exists) {
    throw new ToolSourceError(`Source file does not exist. Create the starter source first.`);
  }

  const directory = dirname(info.resolvedPath);
  const tempPath = resolve(directory, `.forge-${process.pid}-${Date.now()}.tmp`);

  try {
    writeFileSync(tempPath, content, {
      encoding: 'utf8',
      flag: 'wx'
    });

    renameSync(tempPath, info.resolvedPath);
  } finally {
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
  }

  return {
    ...info,
    exists: true
  };
}
