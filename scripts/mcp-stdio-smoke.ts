import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

function parseProjectArgument(args: string[]): string | null {
  const normalized = args[0] === '--' ? args.slice(1) : args;
  const index = normalized.indexOf('--project');

  if (index < 0 || index === normalized.length - 1) {
    return null;
  }

  return normalized[index + 1];
}

function resolveProjectRoot(value: string): string {
  const candidate = resolve(value);

  return basename(candidate) === 'forge.project.json'
    ? dirname(candidate)
    : candidate;
}

const projectArgument = parseProjectArgument(process.argv.slice(2));

if (!projectArgument) {
  console.error([
    'Project path is required.',
    '',
    'Usage:',
    '  bun run mcp:stdio:smoke -- --project <forge-project-folder>'
  ].join('\n'));

  process.exit(2);
}

const projectRoot = resolveProjectRoot(projectArgument);
const manifestPath = join(projectRoot, 'forge.project.json');

if (!existsSync(manifestPath)) {
  console.error(`No forge.project.json found at ${manifestPath}`);
  process.exit(2);
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const stdioServerScript = join(scriptDirectory, 'mcp-stdio.ts');

function createTransport(): StdioClientTransport {
  return new StdioClientTransport({
    command: process.execPath,
    args: [
      stdioServerScript,
      '--project',
      projectRoot
    ],
    cwd: process.cwd(),
    stderr: 'inherit'
  });
}

async function inspectServer(label: string, client: Client): Promise<void> {
  const tools = await client.listTools();
  const resources = await client.listResources();
  const prompts = await client.listPrompts();

  console.log(
    `${label} tools: ${
      tools.tools.length === 0
        ? '(none)'
        : tools.tools.map((tool) => tool.name).join(', ')
    }`
  );

  console.log(
    `${label} resources: ${
      resources.resources.length === 0
        ? '(none)'
        : resources.resources.map((resource) => resource.name).join(', ')
    }`
  );

  console.log(
    `${label} prompts: ${
      prompts.prompts.length === 0
        ? '(none)'
        : prompts.prompts.map((prompt) => prompt.name).join(', ')
    }`
  );
}

async function runModernSmoke(): Promise<void> {
  const client = new Client(
    {
      name: 'modern-mcp-forge-stdio-smoke-modern',
      version: '1.0.0'
    },
    {
      versionNegotiation: {
        mode: 'auto'
      }
    }
  );

  const transport = createTransport();

  try {
    await client.connect(transport);
    console.log(`Modern connection protocol era: ${client.getProtocolEra() ?? 'unknown'}`);
    await inspectServer('Modern', client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function runClassicSmoke(): Promise<void> {
  const client = new Client({
    name: 'modern-mcp-forge-stdio-smoke-classic',
    version: '1.0.0'
  });

  const transport = createTransport();

  try {
    await client.connect(transport);
    await inspectServer('Classic', client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

console.log(`Testing stdio project: ${projectRoot}`);

await runModernSmoke();
await runClassicSmoke();

console.log('MCP stdio transport smoke test passed.');
