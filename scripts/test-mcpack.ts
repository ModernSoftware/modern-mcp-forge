import { existsSync } from 'node:fs';
import { installedMCPackCli } from '../src/lib/server/mcpack/cli-path';
const cli = installedMCPackCli();
if (!existsSync(cli))
  throw new Error(
    'Run bun install --frozen-lockfile before native tests; check FORGE_MCPACK_CLI if set.'
  );
const child = Bun.spawn(
  [
    process.execPath,
    'test',
    '--max-concurrency=1',
    'tests/integration/mcpack-session.test.ts',
    'tests/e2e/mcpack-http.test.ts'
  ],
  { stdout: 'inherit', stderr: 'inherit', env: { ...process.env } }
);
process.exit(await child.exited);
