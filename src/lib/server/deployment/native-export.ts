import {
  capabilityKey,
  capabilityKinds,
  exportContents
} from '../../deployment/selection';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { loadProject } from '@modern-software/mcpack';
import { containedFile } from '../sources/authoring';
import type { ForgeProjectManifest } from '../project/schema';
import type { ProjectSource } from '../sources/schema';
import { resolveDatabasePath } from '../database';
import { NativeProjectError } from '../mcpack/session';
import hostPackage from './template/package.json';
import hostLock from './template/package-lock.json';

const maxBytes = 32 * 1024 * 1024;
const maxEntries = 2048;
const slash = (path: string) => path.split(sep).join('/');
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const dependencies =
  /^(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|requirements[^/]*\.txt|pyproject\.toml|uv\.lock|poetry\.lock)$/i;
const excluded =
  /^(?:node_modules|venv|__pycache__|coverage|forge\.(?:project|cases)\.json|forge\.db|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?)$|\.(?:pem|pfx|p12|key|pyc|tgz|zip)$|-(?:shm|wal|journal)$/i;
type NativeSource = Extract<ProjectSource, { kind: 'native' }>;

export function exportSources(project: ForgeProjectManifest) {
  return (project.sources ?? []).filter(
    (s): s is NativeSource => s.kind === 'native' && s.enabled
  );
}

// Compare source paths in the same namespace. Windows temp directories can have
// a short (8.3) alias, and drive-letter casing differs between filesystem APIs.
function pathKey(path: string) {
  const normalized = resolve(path);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function candidates(folder: string, blocked: Set<string>) {
  const excludedPaths = new Set([...blocked].map(pathKey));
  const result = new Map<string, { size: number; mtime: number }>();
  let visited = 0;
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const name = entry.name;
      const path = join(dir, name);
      if (
        name.startsWith('.') ||
        /[\\:\x00-\x1f]/.test(name) ||
        excluded.test(name) ||
        excludedPaths.has(pathKey(path))
      )
        continue;
      if (++visited > maxEntries)
        throw new NativeProjectError(
          'Source folder has too many entries. Place this pack in a dedicated folder (up to 2048 entries).'
        );
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) {
        const info = statSync(path);
        result.set(slash(relative(folder, path)), {
          size: info.size,
          mtime: info.mtimeMs
        });
      }
    }
  }
  walk(folder);
  return result;
}

async function prepare(
  root: string,
  project: ForgeProjectManifest,
  id: string
) {
  const source = exportSources(project).find((s) => s.id === id);
  if (!source) throw new NativeProjectError('Choose an enabled native source.');
  root = realpathSync.native(root);
  const filename = containedFile(root, source.manifest);
  if (statSync(filename).size > 2 * 1024 * 1024)
    throw new NativeProjectError('Native manifest exceeds 2 MiB.');
  const { manifest, root: packRoot } = await loadProject(filename);
  const folder = realpathSync.native(packRoot);
  const used = new Set<string>();
  for (const kind of capabilityKinds) {
    const hidden = new Set(
      source.disabledCapabilities
        ?.filter((c) => c.kind === kind)
        .map((c) => c.name)
    );
    // Preserve the per-kind types of each manifest list.
    for (let i = manifest[kind].length - 1; i >= 0; i--) {
      const item = manifest[kind][i];
      if (hidden.has(item.name)) manifest[kind].splice(i, 1);
      else used.add(item.worker);
    }
  }
  if (!used.size)
    throw new NativeProjectError(
      'Enable at least one native tool, resource or prompt before exporting.'
    );
  const workers = [];
  for (const [id, worker] of Object.entries(manifest.workers)) {
    if (!used.has(id)) {
      delete manifest.workers[id];
      continue;
    }
    worker.module = slash(relative(folder, realpathSync.native(worker.module)));
    worker.inheritEnv = [
      ...new Set([...worker.inheritEnv, ...Object.keys(worker.env)])
    ];
    worker.env = {};
    workers.push({
      id,
      module: worker.module,
      environment: worker.inheritEnv,
      assets: Object.values(worker.config)
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.replace(/^\.\//, ''))
    });
    // Let MCPack choose the target platform's Python interpreter. A local venv path is not portable.
    if (
      worker.runtime === 'python' &&
      (/[\\/]/.test(worker.executable) ||
        ['python', 'python3'].includes(worker.executable))
    ) {
      Reflect.deleteProperty(worker, 'executable');
    }
  }
  const blocked = new Set([
    realpathSync.native(filename),
    join(folder, 'mcpack.json'),
    join(root, 'bridges')
  ]);
  blocked.add(resolveDatabasePath());
  for (const file of [
    ...project.tools.map((t) => t.entrypoint),
    ...project.resources.map((r) => r.source),
    ...project.prompts.map((p) => p.template)
  ]) {
    blocked.add(resolve(root, file.replaceAll('\\', '/')));
  }
  for (const s of project.sources ?? []) {
    if (s.id === id || s.kind === 'external') continue;
    const path = resolve(
      root,
      (s.kind === 'native' ? s.manifest : s.entrypoint).replaceAll('\\', '/')
    );
    blocked.add(path);
    if (relative(dirname(path), folder) && relative(dirname(path), root))
      blocked.add(dirname(path));
    if (s.kind === 'bridge' && s.cwd && !s.checkoutEnv) {
      const cwd = resolve(root, s.cwd.replaceAll('\\', '/'));
      if (relative(cwd, folder)) blocked.add(cwd);
    }
  }
  const inventory = candidates(folder, blocked);
  for (const worker of workers) {
    worker.assets = worker.assets.filter((name) => inventory.has(name));
    if (!inventory.has(worker.module))
      throw new NativeProjectError(
        'A required worker module is outside the exportable files: ' +
          worker.module
      );
  }
  const files = [...inventory]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, info]) => ({
      path,
      size: info.size,
      dependency: dependencies.test(path)
    }));
  const revision = createHash('sha256')
    .update(json(manifest))
    .update(json(files.map((f) => [f.path, inventory.get(f.path)])))
    .digest('hex');
  const preview = {
    revision,
    files,
    workers,
    capabilities: capabilityKinds.flatMap((kind) =>
      manifest[kind].map(({ name, worker, description }) => ({
        kind,
        name,
        worker,
        description
      }))
    )
  };
  return { folder, manifest, preview };
}

export async function previewExport(
  root: string,
  project: ForgeProjectManifest,
  id: string
) {
  return (await prepare(root, project, id)).preview;
}

export async function exportPack(
  root: string,
  project: ForgeProjectManifest,
  id: string,
  revision: string,
  extras: string[],
  capabilities?: string[]
) {
  const { folder, manifest, preview } = await prepare(root, project, id);
  if (preview.revision !== revision)
    throw new NativeProjectError(
      'The source changed. Refresh the preview and review the export again.',
      409
    );
  const available = new Set(preview.capabilities.map(capabilityKey));
  const selected = new Set(capabilities ?? available);
  if (!selected.size)
    throw new NativeProjectError('Select at least one capability to export.');
  for (const key of selected)
    if (!available.has(key))
      throw new NativeProjectError(
        'Select only enabled capabilities from this source.'
      );
  const contents = exportContents(preview, [...selected]);
  for (const kind of capabilityKinds) {
    for (let i = manifest[kind].length - 1; i >= 0; i--) {
      if (!selected.has(capabilityKey({ kind, ...manifest[kind][i] })))
        manifest[kind].splice(i, 1);
    }
  }
  for (const worker of Object.keys(manifest.workers)) {
    if (!contents.workers.has(worker)) delete manifest.workers[worker];
  }
  const files = new Set([...contents.required, ...extras]);
  const inventory = new Map(preview.files.map((f) => [f.path, f]));
  let bytes = 0;
  const entries: Record<string, string | Uint8Array<ArrayBuffer>> = {
    'package.json': json(hostPackage),
    'package-lock.json': json(hostLock),
    'pack/mcpack.json': json(manifest)
  };
  for (const path of files) {
    const file = inventory.get(path);
    if (!file)
      throw new NativeProjectError(
        'A selected file is outside this native source.'
      );
    if ((bytes += file.size) > maxBytes)
      throw new NativeProjectError(
        'The selected files exceed the 32 MiB export limit.'
      );
    const full = containedFile(folder, path);
    if (relative(realpathSync.native(full), join(folder, path)))
      throw new NativeProjectError(
        'A selected path changed. Review the export again.',
        409
      );
    const descriptor = openSync(
      full,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
    );
    try {
      const info = fstatSync(descriptor);
      if (!info.isFile() || info.size !== file.size)
        throw new NativeProjectError(
          'A selected file changed. Review the export again.',
          409
        );
      entries['pack/' + path] = readFileSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  }
  entries['README.md'] = deploymentGuide(id, files, contents.environment);
  return new Bun.Archive(entries, { compress: 'gzip' }).blob();
}

function deploymentGuide(id: string, files: Set<string>, env: string[]) {
  const lines = [
    '# Deploy ' + id,
    '',
    'Extract the archive into an empty directory. Run these commands from that directory with Node.js 22 or newer. Install Python 3 if the pack uses Python workers.',
    '',
    '```sh',
    'npm ci',
    '```',
    '',
    'The root lockfile installs the MCPack host. The pack/ folder contains the worker code, assets and dependency files you selected.'
  ];
  if (files.has('package-lock.json') || files.has('npm-shrinkwrap.json'))
    lines.push('', '```sh', 'npm ci --prefix pack', '```');
  else if (files.has('package.json'))
    lines.push(
      '',
      'Install the worker package with its package manager inside pack/. For an npm project run npm install --prefix pack.'
    );
  if (files.has('requirements.txt'))
    lines.push(
      '',
      'In the deployment Python environment, run python -m pip install -r pack/requirements.txt.'
    );
  if (files.has('pyproject.toml'))
    lines.push(
      '',
      'Install the Python project in pack/ using its declared package manager. Activate that environment before starting the server.'
    );
  lines.push(
    '',
    'Set any required worker environment variables in the service environment. The manifest lists the variables each worker inherits. Local Python interpreter paths use the deployment Python on PATH.'
  );
  if (env.length) lines.push('', ...env.map((key) => '- ' + key));
  lines.push(
    '',
    'Validate the manifest and start the HTTP endpoint on http://127.0.0.1:3000/mcp.',
    '',
    '```sh',
    'npm run validate',
    'npm start',
    '```',
    '',
    'For a network deployment, set MCPACK_HTTP_TOKEN in your service environment, replace mcp.example.com with the public hostname, and terminate TLS at your reverse proxy. The allowlist takes a hostname without a port.',
    '',
    '```sh',
    'npm start -- --host 0.0.0.0 --port 3000 --allow-host mcp.example.com --token-env MCPACK_HTTP_TOKEN',
    '```',
    '',
    'Send Authorization: Bearer <token> from the MCP client. For a local stdio client, run npm run --silent start:stdio.',
    ''
  );
  return lines.join('\n');
}
