import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

/** Resolve without importing MCPack's Node runtime into Forge's Bun process. */
export function installedMCPackCli(): string {
  if (process.env.FORGE_MCPACK_CLI) return resolve(process.env.FORGE_MCPACK_CLI);
  const entrypoint = fileURLToPath(import.meta.resolve('@modern-software/mcpack'));
  return join(dirname(entrypoint), 'cli.js');
}
