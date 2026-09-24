import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const cli = resolve(
  process.env.FORGE_MCPACK_CLI || '.mcpack-runtime/node_modules/@modernsoftware/mcpack/dist/cli.js'
);
if (!existsSync(cli))
  throw new Error(
    'Install MCPack with bun run mcpack:setup -- <checkout> before running native tests.'
  );
const child = Bun.spawn(
  [
    process.execPath,
    'test',
    '--max-concurrency=1',
    'tests/integration/mcpack-session.test.ts',
    'tests/e2e/mcpack-http.test.ts'
  ],
  { stdout: 'inherit', stderr: 'inherit', env: { ...process.env, FORGE_MCPACK_CLI: cli } }
);
process.exit(await child.exited);
