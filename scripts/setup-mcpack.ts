import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

// A local, development-only installation. Nothing is published or vendored.
const source = process.argv[2];
if (!source) throw new Error('Usage: bun run mcpack:setup -- <local-mcpack-checkout>');
const sourceRoot = resolve(source === '--' ? process.argv[3] : source);
const destination = resolve('.mcpack-runtime');
const temporary = await mkdtemp(join(tmpdir(), 'forge-mcpack-install-'));
const npm = Bun.which(process.platform === 'win32' ? 'npm.cmd' : 'npm');
const node = Bun.which('node');
if (!npm || !node) throw new Error('npm and Node.js 22+ are required.');
const npmCli =
  process.platform === 'win32'
    ? join(dirname(npm), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    : await realpath(npm);

async function run(args: string[], cwd: string) {
  const child = Bun.spawn([node!, npmCli, ...args], { cwd, stdout: 'pipe', stderr: 'inherit' });
  const output = await new Response(child.stdout).text();
  if ((await child.exited) !== 0) throw new Error(`npm ${args[0]} failed`);
  return output;
}

try {
  const pkg = JSON.parse(await readFile(join(sourceRoot, 'package.json'), 'utf8'));
  if (pkg.name !== '@modern-software/mcpack') throw new Error('Select the MCPack repository.');
  await run(['ci'], sourceRoot);
  const packed = await run(['pack', '--json', '--pack-destination', temporary], sourceRoot);
  const start = packed.search(/\[\r?\n/);
  if (start < 0) throw new Error('npm pack did not return package information.');
  const [artifact] = JSON.parse(packed.slice(start));
  await mkdir(destination, { recursive: true });
  await writeFile(
    join(destination, 'package.json'),
    JSON.stringify({ name: 'forge-local-mcpack', private: true })
  );
  await run(
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(temporary, artifact.filename)],
    destination
  );
  await writeFile(
    join(destination, 'source.json'),
    JSON.stringify(
      { name: pkg.name, sourceRoot, version: pkg.version, integrity: artifact.integrity },
      null,
      2
    )
  );
  console.log(
    `Installed local MCPack ${pkg.version}. Set FORGE_MCPACK_CLI to ${join(destination, "node_modules", "@modern-software", "mcpack", "dist", "cli.js")} to use it instead of the registry dependency.`
  );
} finally {
  await rm(temporary, { recursive: true, force: true, maxRetries: 5 });
}
