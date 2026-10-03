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
import { ManifestSchema, type Manifest } from '@modern-software/mcpack';
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
  const files = [
    relative(realpathSync(project.path), manifestPath).replaceAll('\\', '/')
  ];
  let error: string | undefined;
  // A malformed manifest remains editable after failed startup or an external edit.
  try {
    const manifest = ManifestSchema.parse(JSON.parse(content));
    for (const worker of Object.values(manifest.workers)) {
      const path = containedFile(dirname(manifestPath), worker.module);
      const name = relative(realpathSync(project.path), path).replaceAll(
        '\\',
        '/'
      );
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
    path: relative(realpathSync(project.path), path).replaceAll('\\', '/'),
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
  runtime: 'node' | 'python',
  initial?: ReturnType<typeof nativeStarter>
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
    const starter = initial ?? nativeStarter(id, runtime);
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

export type CapabilityKind = 'tools' | 'resources' | 'prompts';

/** Authoring reads disk, not discovery, so stopped/broken sources remain editable. */
export function nativeWorkspace(project: RegisteredProject) {
  const manifest = configuration(project);
  return {
    project,
    legacyCount:
      manifest.tools.length +
      manifest.resources.length +
      manifest.prompts.length,
    sources: (manifest.sources ?? []).map((source) => {
      if (source.kind !== 'native')
        return {
          source,
          manifest: null,
          revision: '',
          error: undefined as string | undefined
        };
      try {
        const document = nativeDocument(project, source.id);
        const parsed = ManifestSchema.parse(
          JSON.parse(read(document.manifestPath))
        );
        const manifest = {
          tools: parsed.tools,
          resources: parsed.resources,
          prompts: parsed.prompts,
          workers: Object.fromEntries(
            Object.entries(parsed.workers).map(([id, worker]) => [
              id,
              {
                runtime: worker.runtime,
                module: worker.module,
                maxConcurrent: worker.maxConcurrent
              }
            ])
          )
        };
        return {
          source,
          manifest,
          revision: digest(read(document.manifestPath)),
          error: document.error
        };
      } catch (error) {
        return {
          source,
          manifest: null,
          revision: '',
          error: error instanceof Error ? error.message : String(error)
        };
      }
    })
  };
}

/** Create only the requested capability, with a dedicated editable worker module. */
export function createNativeCapability(
  project: RegisteredProject,
  id: string,
  runtime: 'node' | 'python',
  kind: CapabilityKind,
  name: string,
  description: string,
  options?: {
    worker: string;
    handler?: string;
    revision: string;
    newWorker: boolean;
  }
) {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name))
    throw new NativeProjectError(
      'Use a capability name starting with a letter and up to 64 letters, numbers, underscores or hyphens.'
    );
  const workspace = nativeWorkspace(project);
  if (
    workspace.sources.some((entry) =>
      entry.manifest?.[kind].some((item) => item.name === name)
    )
  )
    throw new NativeProjectError(
      'This capability name already exists in the project.'
    );
  const starter = nativeStarter(id, runtime);
  const definition = { ...starter.manifest[kind][0], name, description };
  if (kind === 'resources')
    Object.assign(definition, { uri: `mcpack://${id}/${name}` });
  if (options) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(options.worker))
      throw new NativeProjectError('Invalid worker ID.');
    const document = nativeDocument(project, id);
    const file = readNativeFile(project, id, document.files[0]);
    if (file.revision !== options.revision)
      throw new NativeProjectError(
        'File changed on disk. Reload before saving.',
        409
      );
    const existing = JSON.parse(file.content) as Manifest;
    const module = `${options.worker}.${runtime === 'node' ? 'mjs' : 'py'}`;
    const modulePath = join(dirname(document.manifestPath), module);
    let created = false;
    try {
      if (options.newWorker) {
        if (Object.hasOwn(existing.workers, options.worker))
          throw new NativeProjectError('Worker ID already exists.');
        writeFileSync(modulePath, starter.code, { flag: 'wx' });
        created = true;
        Object.defineProperty(existing.workers, options.worker, {
          value: { runtime, module: `./${module}` },
          enumerable: true
        });
      } else {
        if (
          !Object.hasOwn(existing.workers, options.worker) ||
          !options.handler?.trim()
        )
          throw new NativeProjectError(
            'Select an existing worker and its handler.'
          );
        definition.handler = options.handler;
      }
      definition.worker = options.worker;
      const updated = { ...existing, [kind]: [...existing[kind], definition] };
      saveNativeFile(
        project,
        id,
        file.path,
        JSON.stringify(updated, null, 2) + '\n',
        file.revision
      );
    } catch (error) {
      if (created) rmSync(modulePath, { force: true });
      throw error;
    }
    return;
  }
  const manifest = {
    ...starter.manifest,
    tools: [],
    resources: [],
    prompts: [],
    [kind]: [definition]
  };
  ManifestSchema.parse(manifest);
  // Keep the factory's internal handlers; only the requested definition is exposed.
  createNativeSource(project, id, runtime, {
    ...starter,
    manifest
  } as ReturnType<typeof nativeStarter>);
}

export function updateNativeDefinition(
  project: RegisteredProject,
  id: string,
  kind: CapabilityKind,
  originalName: string,
  definition: unknown,
  revision: string
) {
  const document = nativeDocument(project, id);
  const file = readNativeFile(project, id, document.files[0]);
  if (file.revision !== revision)
    throw new NativeProjectError(
      'File changed on disk. Reload before saving.',
      409
    );
  const manifest = JSON.parse(file.content) as Manifest;
  const index = manifest[kind].findIndex((item) => item.name === originalName);
  if (index < 0) throw new NativeProjectError('Capability not found.');
  const definitions: unknown[] = [...manifest[kind]];
  definitions[index] = definition;
  const updated = { ...manifest, [kind]: definitions };
  const parsed = ManifestSchema.parse(updated);
  const names = parsed[kind].map((item) => item.name);
  if (new Set(names).size !== names.length)
    throw new NativeProjectError('Capability name already exists.');
  const replacement = parsed[kind][index];
  if (
    replacement.name !== originalName &&
    document.source.disabledCapabilities?.some(
      (item) => item.kind === kind && item.name === originalName
    )
  )
    throw new NativeProjectError(
      'Enable this capability before renaming it, or keep its current name.'
    );
  const workspace = nativeWorkspace(project);
  if (
    workspace.sources.some(
      (entry) =>
        entry.source.id !== id &&
        entry.manifest?.[kind].some((item) => item.name === replacement.name)
    )
  )
    throw new NativeProjectError(
      'Capability name already exists in another source.'
    );
  if (kind === 'resources') {
    const uris = parsed.resources.map((item) => item.uri);
    if (
      new Set(uris).size !== uris.length ||
      workspace.sources.some(
        (entry) =>
          entry.source.id !== id &&
          entry.manifest?.resources.some(
            (item) => item.uri === parsed.resources[index].uri
          )
      )
    )
      throw new NativeProjectError('Resource URI already exists.');
  }
  return saveNativeFile(
    project,
    id,
    file.path,
    JSON.stringify(updated, null, 2) + '\n',
    revision
  );
}

export function setCapabilityEnabled(
  project: RegisteredProject,
  id: string,
  kind: CapabilityKind,
  name: string,
  enabled: boolean
) {
  const manifest = configuration(project);
  const source = manifest.sources?.find((item) => item.id === id);
  if (!source || source.kind !== 'native')
    throw new NativeProjectError('Native source not found.');
  const native = nativeWorkspace(project).sources.find(
    (entry) => entry.source.id === id
  )?.manifest;
  if (!native?.[kind].some((item) => item.name === name))
    throw new NativeProjectError('Capability not found.');
  source.disabledCapabilities = (source.disabledCapabilities ?? []).filter(
    (entry) => entry.kind !== kind || entry.name !== name
  );
  if (!enabled) source.disabledCapabilities.push({ kind, name });
  atomicWrite(projectFile(project), JSON.stringify(manifest, null, 2) + '\n');
}

export function saveExternalSource(
  project: RegisteredProject,
  input: unknown,
  create: boolean
) {
  const source = ProjectSourceSchema.parse(input);
  if (source.kind !== 'external')
    throw new NativeProjectError('Expected an external source.');
  const manifest = configuration(project);
  const sources = manifest.sources ?? [];
  const index = sources.findIndex((entry) => entry.id === source.id);
  if (create && index !== -1)
    throw new NativeProjectError('Source ID already exists.');
  if (!create && (index === -1 || sources[index].kind !== 'external'))
    throw new NativeProjectError('External source not found.');
  if (create) sources.push(source);
  else sources[index] = source;
  manifest.sources = ProjectSourcesSchema.parse(sources);
  atomicWrite(projectFile(project), JSON.stringify(manifest, null, 2) + '\n');
}

export function changeExternalSource(
  project: RegisteredProject,
  id: string,
  action: 'enable' | 'disable' | 'remove'
) {
  const manifest = configuration(project);
  const source = manifest.sources?.find((entry) => entry.id === id);
  if (!source || source.kind !== 'external')
    throw new NativeProjectError('External source not found.');
  if (action === 'remove')
    manifest.sources = manifest.sources!.filter((entry) => entry.id !== id);
  else source.enabled = action === 'enable';
  atomicWrite(projectFile(project), JSON.stringify(manifest, null, 2) + '\n');
}
