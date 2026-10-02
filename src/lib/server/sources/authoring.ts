import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ManifestSchema } from '@modern-software/mcpack';
import { ForgeProjectManifestSchema } from '../project/schema';
import { NativeProjectError } from '../mcpack/session';
import type { RegisteredProject } from '../projects/project-service';
import { ProjectSourceSchema, ProjectSourcesSchema } from './schema';
import { nativeStarter } from './starter';

const MAX_BYTES = 256 * 1024;
const digest = (content: string) =>
  createHash('sha256').update(content).digest('hex');

function read(path: string) {
  if (statSync(path).size > MAX_BYTES)
    throw new NativeProjectError('File exceeds the 256 KiB editor limit.');
  return readFileSync(path, 'utf8');
}

export function containedFile(root: string, filename: string) {
  if (
    /^(?:[A-Za-z]:|[\\/])/.test(filename) ||
    filename.split(/[\\/]/).includes('..')
  ) {
    throw new NativeProjectError(
      'Use a relative path inside the source folder.'
    );
  }
  const canonicalRoot = realpathSync(root);
  const path = realpathSync(
    resolve(canonicalRoot, filename.replaceAll('\\', '/'))
  );
  const rel = relative(canonicalRoot, path);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) {
    throw new NativeProjectError('File resolves outside the source folder.');
  }
  return path;
}

function atomicWrite(path: string, content: string) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function projectFile(project: RegisteredProject) {
  return containedFile(project.path, 'forge.project.json');
}

function configuration(project: RegisteredProject) {
  return ForgeProjectManifestSchema.parse(
    JSON.parse(read(projectFile(project)))
  );
}

export function nativeDocument(project: RegisteredProject, id: string) {
  const source = configuration(project).sources?.find((item) => item.id === id);
  if (!source || source.kind !== 'native')
    throw new NativeProjectError('Native source not found.');
  const manifestPath = containedFile(project.path, source.manifest);
  const content = read(manifestPath);
  const files = [relative(project.path, manifestPath).replaceAll('\\', '/')];
  let error: string | undefined;
  // A malformed manifest remains editable after failed startup or an external edit.
  try {
    const manifest = ManifestSchema.parse(JSON.parse(content));
    for (const worker of Object.values(manifest.workers)) {
      const path = containedFile(dirname(manifestPath), worker.module);
      const name = relative(project.path, path).replaceAll('\\', '/');
      if (!files.includes(name)) files.push(name);
    }
  } catch (failure) {
    error = failure instanceof Error ? failure.message : String(failure);
  }
  return { source, files, error, manifestPath };
}

export function readNativeFile(
  project: RegisteredProject,
  id: string,
  filename: string
) {
  const document = nativeDocument(project, id);
  const path = containedFile(project.path, filename);
  if (
    !document.files.some((file) => containedFile(project.path, file) === path)
  ) {
    throw new NativeProjectError(
      'Only the manifest and declared worker modules can be edited.'
    );
  }
  const content = read(path);
  return {
    path: relative(project.path, path).replaceAll('\\', '/'),
    content,
    revision: digest(content)
  };
}

export function saveNativeFile(
  project: RegisteredProject,
  id: string,
  filename: string,
  content: string,
  revision: string
) {
  const current = readNativeFile(project, id, filename);
  if (current.revision !== revision)
    throw new NativeProjectError(
      'File changed on disk. Reload before saving.',
      409
    );
  if (Buffer.byteLength(content) > MAX_BYTES)
    throw new NativeProjectError('File exceeds the 256 KiB editor limit.');
  const path = containedFile(project.path, filename);
  const document = nativeDocument(project, id);
  if (path === document.manifestPath) {
    const manifest = ManifestSchema.parse(JSON.parse(content));
    for (const worker of Object.values(manifest.workers))
      containedFile(dirname(path), worker.module);
  }
  atomicWrite(path, content);
  return readNativeFile(project, id, filename);
}

// Synchronous fresh read + atomic write preserves concurrent classic authoring changes.
export function changeNativeSource(
  project: RegisteredProject,
  id: string,
  change: 'remove' | 'enable' | 'disable'
) {
  const manifest = configuration(project);
  const source = manifest.sources?.find((item) => item.id === id);
  if (!source || source.kind !== 'native')
    throw new NativeProjectError('Native source not found.');
  if (change === 'remove')
    manifest.sources = manifest.sources!.filter((item) => item.id !== id);
  else source.enabled = change === 'enable';
  atomicWrite(projectFile(project), `${JSON.stringify(manifest, null, 2)}\n`);
}

export function attachNativeSource(
  project: RegisteredProject,
  id: string,
  filename: string
) {
  const source = ProjectSourceSchema.parse({
    id,
    kind: 'native',
    manifest: filename,
    enabled: true
  });
  const path = containedFile(project.path, filename);
  const native = ManifestSchema.parse(JSON.parse(read(path)));
  for (const worker of Object.values(native.workers))
    containedFile(dirname(path), worker.module);
  const manifest = configuration(project);
  manifest.sources = ProjectSourcesSchema.parse([
    ...(manifest.sources ?? []),
    source
  ]);
  atomicWrite(projectFile(project), `${JSON.stringify(manifest, null, 2)}\n`);
}

export function createNativeSource(
  project: RegisteredProject,
  id: string,
  runtime: 'node' | 'python'
) {
  const existing = configuration(project).sources ?? [];
  ProjectSourcesSchema.parse([
    ...existing,
    { id, kind: 'native', manifest: `native/${id}/mcpack.json` }
  ]);
  const root = realpathSync(project.path);
  if (!existsSync(join(root, 'native'))) mkdirSync(join(root, 'native'));
  const folder = join(containedFile(root, 'native'), id);
  // Exclusive creation: never overwrite an existing folder or follow its symlink.
  mkdirSync(folder);
  try {
    const starter = nativeStarter(id, runtime);
    writeFileSync(join(folder, starter.module), starter.code, { flag: 'wx' });
    writeFileSync(
      join(folder, 'mcpack.json'),
      `${JSON.stringify(starter.manifest, null, 2)}\n`,
      { flag: 'wx' }
    );
    attachNativeSource(project, id, `native/${id}/mcpack.json`);
  } catch (error) {
    rmSync(folder, { recursive: true, force: true });
    throw error;
  }
}
