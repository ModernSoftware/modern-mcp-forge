import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

/** Resolve without importing MCPack's Node runtime into Forge's Bun process. */
export function installedMCPackCli(): string {
  if (process.env.FORGE_MCPACK_CLI) return resolve(process.env.FORGE_MCPACK_CLI);
  // Vite's SSR import.meta.resolve depends on Node loader hooks that are not
  // available on every Bun platform. Resolve through Forge's actual runtime.
  const entrypoint = Bun.resolveSync(
    '@modern-software/mcpack',
    dirname(fileURLToPath(import.meta.url))
  );
  return join(dirname(entrypoint), 'cli.js');
}
