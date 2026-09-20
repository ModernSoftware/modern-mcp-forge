import { existsSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

function writeError(message: string): void {
  process.stderr.write(`${message}\n`);
}

function usage(): string {
  return [
    'Modern MCP Forge stdio server',
    '',
    'Usage:',
    '  bun scripts/mcp-stdio.ts --project <forge-project-folder>',
    '',
    'You may also pass forge.project.json directly:',
    '  bun scripts/mcp-stdio.ts --project <path/to/forge.project.json>',
    '',
    'Important:',
    '  stdout is reserved exclusively for MCP protocol messages.',
    '  Diagnostics are written to stderr.'
  ].join('\n');
}

function parseProjectArgument(args: string[]): string | null {
  const normalized = args[0] === '--' ? args.slice(1) : args;

  if (normalized.includes('--help') || normalized.includes('-h')) {
    writeError(usage());
    process.exit(0);
  }

  const projectIndex = normalized.indexOf('--project');

  if (projectIndex < 0 || projectIndex === normalized.length - 1) {
    return null;
  }

  return normalized[projectIndex + 1];
}

function resolveManifestPath(projectArgument: string): string {
  const candidate = resolve(projectArgument);

  return basename(candidate) === 'forge.project.json'
    ? candidate
    : join(candidate, 'forge.project.json');
}

const projectArgument = parseProjectArgument(process.argv.slice(2));

if (!projectArgument) {
  writeError(usage());
  process.exit(2);
}

const manifestPath = resolveManifestPath(projectArgument);

if (!existsSync(manifestPath)) {
  writeError(`Forge project manifest not found: ${manifestPath}`);
  process.exit(2);
}

if (!statSync(manifestPath).isFile()) {
  writeError(`Forge project manifest is not a file: ${manifestPath}`);
  process.exit(2);
}

try {
  /*
   * Keep MCP transport/server modules out of the process until the selected
   * project has been validated.
   *
   * Besides making startup cheaper, this is important for CLI failure paths:
   * an invalid manifest must print its diagnostic and terminate immediately,
   * without initializing any MCP stdio resources that can keep the Bun event
   * loop alive.
   */
  const { selectProjectForProcess } = await import(
    '../src/lib/server/project/project-selection'
  );
  const { loadProjectManifest } = await import(
    '../src/lib/server/project/loader'
  );

  selectProjectForProcess(manifestPath);
  loadProjectManifest();

  const { serveForgeMcpStdio } = await import(
    '../src/lib/server/mcp/stdio'
  );

  await serveForgeMcpStdio();
} catch (error) {
  writeError(
    `Modern MCP Forge stdio server failed: ${
      error instanceof Error
        ? error.stack ?? error.message
        : String(error)
    }`
  );

  process.exitCode = 1;
}
