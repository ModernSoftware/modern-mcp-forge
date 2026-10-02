import { expect, test } from 'bun:test';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createManifest, writeProject } from '../helpers/project';
import {
  attachNativeSource,
  changeNativeSource,
  createNativeSource,
  nativeDocument,
  readNativeFile,
  saveNativeFile
} from '../../src/lib/server/sources/authoring';
import type { RegisteredProject } from '../../src/lib/server/projects/project-service';
import { ProjectSourceManager } from '../../src/lib/server/sources/manager';
import { projectCatalog } from '../../src/lib/server/sources/catalog';
import { ForgeProjectManifestSchema } from '../../src/lib/server/project/schema';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'forge-authoring-'));
  const manifest = createManifest();
  writeProject(root, manifest);
  const project: RegisteredProject = {
    id: manifest.project.id,
    name: 'Test',
    path: root,
    available: true,
    createdAt: '',
    lastOpenedAt: ''
  };
  return {
    root,
    project,
    close: () => rmSync(root, { recursive: true, force: true })
  };
}

test('native authoring preserves classic definitions and does not overwrite existing source files', () => {
  const { project, root, close } = fixture();
  try {
    const forgePath = join(root, 'forge.project.json');
    const original = JSON.parse(readFileSync(forgePath, 'utf8'));
    original.custom = { preserved: true };
    writeFileSync(forgePath, JSON.stringify(original));
    createNativeSource(project, 'support', 'node');
    expect(() => createNativeSource(project, 'support', 'python')).toThrow();
    expect(() => createNativeSource(project, '../bad', 'node')).toThrow();
    const document = nativeDocument(project, 'support');
    expect(document.files).toEqual([
      'native/support/mcpack.json',
      'native/support/handlers.mjs'
    ]);
    const file = readNativeFile(project, 'support', document.files[1]);
    expect(() =>
      saveNativeFile(project, 'support', file.path, 'bad', 'stale')
    ).toThrow('File changed');
    expect(readFileSync(join(root, file.path), 'utf8')).toBe(file.content);
    const saved = saveNativeFile(
      project,
      'support',
      file.path,
      file.content.replace('Hello, ', 'Welcome, '),
      file.revision
    );
    expect(saved.revision).not.toBe(file.revision);
    expect(() =>
      readNativeFile(project, 'support', 'forge.project.json')
    ).toThrow('Only the manifest');
    expect(() => readNativeFile(project, 'support', '../secret')).toThrow(
      'relative path'
    );
    const declaration = readNativeFile(project, 'support', document.files[0]);
    expect(() =>
      saveNativeFile(
        project,
        'support',
        declaration.path,
        '{invalid',
        declaration.revision
      )
    ).toThrow();
    expect(() =>
      saveNativeFile(
        project,
        'support',
        file.path,
        'x'.repeat(256 * 1024 + 1),
        saved.revision
      )
    ).toThrow('256 KiB');
    changeNativeSource(project, 'support', 'disable');
    expect(nativeDocument(project, 'support').source.enabled).toBe(false);
    changeNativeSource(project, 'support', 'remove');
    expect(readFileSync(join(root, file.path), 'utf8')).toBe(saved.content);
    attachNativeSource(project, 'reattached', 'native/support/mcpack.json');
    const after = JSON.parse(readFileSync(forgePath, 'utf8'));
    expect(after.custom).toEqual(original.custom);
    expect(after.tools).toEqual(original.tools);
    writeFileSync(join(root, 'native/support/mcpack.json'), '{broken');
    expect(nativeDocument(project, 'reattached').error).toBeTruthy();
    expect(
      readNativeFile(project, 'reattached', 'native/support/mcpack.json')
        .content
    ).toBe('{broken');
  } finally {
    close();
  }
});

test('authoring refuses source folders escaping through symlinks', () => {
  const a = fixture();
  const b = fixture();
  try {
    createNativeSource(b.project, 'outside', 'node');
    symlinkSync(
      b.root,
      join(a.root, 'native'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    expect(() => createNativeSource(a.project, 'unsafe', 'node')).toThrow(
      'outside'
    );
    expect(() =>
      attachNativeSource(
        a.project,
        'unsafe',
        'native/native/outside/mcpack.json'
      )
    ).toThrow('outside');
  } finally {
    a.close();
    b.close();
  }
});

test('project catalog rejects collisions and configuration drift', async () => {
  const manager = new ProjectSourceManager(() => ({
    async start() {},
    async close() {},
    async invoke() {},
    health: () => ({ status: 'ready' }),
    async discover() {
      return {
        tools: [
          { name: 'duplicate', inputSchema: { type: 'object' as const } }
        ],
        resources: [],
        prompts: []
      };
    }
  }));
  const manifest = ForgeProjectManifestSchema.parse({
    ...createManifest(),
    sources: [
      { id: 'first', kind: 'native', manifest: 'first/mcpack.json' },
      { id: 'second', kind: 'native', manifest: 'second/mcpack.json' }
    ]
  });
  try {
    await manager.open(manifest.project.id, '.', manifest.sources!);
    expect(() => projectCatalog(manifest, manager)).toThrow('Duplicate tools');
    manifest.sources![1].enabled = false;
    expect(() => projectCatalog(manifest, manager)).toThrow(
      'configuration changed'
    );
    await manager.open(manifest.project.id, '.', manifest.sources!);
    expect(projectCatalog(manifest, manager).catalogs.length).toBe(1);
    if (manifest.sources![0].kind === 'native')
      manifest.sources![0].manifest = 'changed/mcpack.json';
    expect(() => projectCatalog(manifest, manager)).toThrow(
      'configuration changed'
    );
  } finally {
    await manager.close();
  }
});

test('editor paths stay relative when the project root is a symlink alias', () => {
  const project = fixture();
  const alias = fixture();
  try {
    const linked = join(alias.root, 'linked');
    symlinkSync(
      project.root,
      linked,
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    const selected = { ...project.project, path: linked };
    createNativeSource(selected, 'support', 'node');
    const document = nativeDocument(selected, 'support');
    expect(document.files).toEqual([
      'native/support/mcpack.json',
      'native/support/handlers.mjs'
    ]);
    const file = readNativeFile(selected, 'support', document.files[1]);
    expect(file.path).toBe('native/support/handlers.mjs');
    expect(
      saveNativeFile(
        selected,
        'support',
        file.path,
        file.content + '\n',
        file.revision
      ).path
    ).toBe(file.path);
  } finally {
    alias.close();
    project.close();
  }
});
