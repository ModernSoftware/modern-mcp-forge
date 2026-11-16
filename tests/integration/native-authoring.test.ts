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
  createNativeCapability,
  previewNativeHandler,
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
    expect(() => projectCatalog(manifest, manager.snapshot())).toThrow(
      'Duplicate tools'
    );
    manifest.sources![1].enabled = false;
    expect(() => projectCatalog(manifest, manager.snapshot())).toThrow(
      'configuration changed'
    );
    await manager.open(manifest.project.id, '.', manifest.sources!);
    expect(projectCatalog(manifest, manager.snapshot()).catalogs.length).toBe(
      1
    );
    if (manifest.sources![0].kind === 'native')
      manifest.sources![0].manifest = 'changed/mcpack.json';
    expect(() => projectCatalog(manifest, manager.snapshot())).toThrow(
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

test('workspace creates one capability, reuses workers, and preserves disabled definitions', async () => {
  const {
    createNativeCapability,
    nativeWorkspace,
    updateNativeDefinition,
    setCapabilityEnabled
  } = await import('../../src/lib/server/sources/authoring');
  const { project, root, close } = fixture();
  const manager = new ProjectSourceManager();
  try {
    createNativeCapability(
      project,
      'support',
      'node',
      'tools',
      'lookup',
      'Lookup example'
    );
    let workspace = nativeWorkspace(project);
    expect(
      workspace.sources[0].manifest?.tools.map((item) => item.name)
    ).toEqual(['lookup']);
    expect(workspace.sources[0].manifest?.resources).toEqual([]);
    expect(workspace.sources[0].manifest?.prompts).toEqual([]);
    expect(workspace.sources[0].manifest?.workers.main).not.toHaveProperty(
      'env'
    );
    expect(() =>
      createNativeCapability(
        project,
        'duplicate',
        'python',
        'tools',
        'lookup',
        ''
      )
    ).toThrow('already exists');
    // Existing-worker binding does not inject unrelated example handlers.
    const moduleFile = join(root, 'native/support/handlers.mjs');
    const initialCode = readFileSync(moduleFile, 'utf8');
    expect(initialCode).toContain('lookup');
    expect(initialCode).not.toContain('greet');
    expect(initialCode).not.toContain('prompts:');
    writeFileSync(
      moduleFile,
      initialCode.replace(
        '    tools: {',
        `    prompts: { welcome: async ({ name = 'Test' }) => ({ messages: [{ role: 'user', content: { type: 'text', text: 'Welcome ' + name } }] }) },
    tools: {`
      )
    );
    createNativeCapability(
      project,
      'support',
      'node',
      'prompts',
      'welcome',
      '',
      {
        worker: 'main',
        handler: 'welcome',
        revision: workspace.sources[0].revision,
        newWorker: false
      }
    );
    workspace = nativeWorkspace(project);
    createNativeCapability(
      project,
      'support',
      'python',
      'resources',
      'guide',
      '',
      {
        worker: 'documents',
        revision: workspace.sources[0].revision,
        newWorker: true
      }
    );
    workspace = nativeWorkspace(project);
    expect(Object.keys(workspace.sources[0].manifest!.workers)).toEqual([
      'main',
      'documents'
    ]);
    const document = nativeDocument(project, 'support');
    const file = readNativeFile(project, 'support', document.files[0]);
    const definition = workspace.sources[0].manifest!.tools[0];
    expect(() =>
      updateNativeDefinition(
        project,
        'support',
        'tools',
        'lookup',
        { ...definition, description: 'stale' },
        'wrong'
      )
    ).toThrow('changed on disk');
    const updated = updateNativeDefinition(
      project,
      'support',
      'tools',
      'lookup',
      { ...definition, description: 'Updated' },
      file.revision
    );
    expect(JSON.parse(updated.content).tools[0].description).toBe('Updated');
    setCapabilityEnabled(project, 'support', 'tools', 'lookup', false);
    expect(() =>
      updateNativeDefinition(
        project,
        'support',
        'tools',
        'lookup',
        { ...definition, name: 'renamed' },
        updated.revision
      )
    ).toThrow('Enable this capability');
    const config = JSON.parse(
      readFileSync(join(root, 'forge.project.json'), 'utf8')
    );
    const opened = await manager.open(project.id, root, config.sources);
    expect(opened.status).toBe('ready');
    expect(opened.sources[0].catalog.tools).toEqual([]);
    expect(
      opened.sources[0].catalog.resources.map((item) => item.name)
    ).toEqual(['guide']);
    await expect(
      manager.invoke(project.id, opened.generation, 'support', {
        kind: 'tool',
        name: 'lookup',
        arguments: { name: 'Test' }
      })
    ).rejects.toThrow('disabled or not exposed');
    const prompt = (await manager.invoke(
      project.id,
      opened.generation,
      'support',
      { kind: 'prompt', name: 'welcome', arguments: {} }
    )) as any;
    expect(prompt.messages[0].content.text).toBe('Welcome Test');
    setCapabilityEnabled(project, 'support', 'tools', 'lookup', true);
    expect(nativeWorkspace(project).sources[0].source).toMatchObject({
      disabledCapabilities: []
    });
  } finally {
    await manager.close();
    close();
  }
}, 30_000);

test('shared workers gain all capability kinds without losing existing handlers, configuration or shared state', async () => {
  const { project, root, close } = fixture();
  const manager = new ProjectSourceManager();
  try {
    for (const runtime of ['node', 'python'] as const) {
      const id = `shared_${runtime}`;
      createNativeSource(project, id, runtime);
      const path = `native/${id}/handlers.${runtime === 'node' ? 'mjs' : 'py'}`;
      const file = readNativeFile(project, id, path);
      let source = file.content;
      if (runtime === 'node')
        source = source
          .replace('  return {', '  let calls = 0;\n  return {')
          .replace(
            'async greet({ name }) {',
            'async greet({ name }) {\n        calls += 1;'
          );
      else
        source = source.replace(
          '    def greet(args, call):',
          '    calls = 0\n    def greet(args, call):\n        nonlocal calls\n        calls += 1'
        );
      saveNativeFile(project, id, path, source, file.revision);
      for (const kind of ['tools', 'resources', 'prompts'] as const) {
        const name = `${id}_${kind}`;
        const manifest = readNativeFile(
          project,
          id,
          `native/${id}/mcpack.json`
        );
        const preview = previewNativeHandler(
          project,
          id,
          kind,
          name,
          'main',
          manifest.revision
        );
        expect(readNativeFile(project, id, path).content).toBe(source);
        // Reusing a worker derives its runtime from the manifest, not this UI hint.
        createNativeCapability(
          project,
          id,
          'node',
          kind,
          name,
          'Shared handler',
          {
            worker: 'main',
            newWorker: false,
            addHandler: true,
            revision: manifest.revision,
            workerRevision: preview.revision
          }
        );
        source = readNativeFile(project, id, path).content;
        expect(source).toBe(preview.content);
        const updated = JSON.parse(
          readNativeFile(project, id, manifest.path).content
        );
        expect(updated.workers).toEqual(JSON.parse(manifest.content).workers);
        expect(updated[kind].at(-1)).toMatchObject({
          worker: 'main',
          handler: name
        });
        expect(nativeDocument(project, id).files).toHaveLength(2);
      }
      const final = readNativeFile(project, id, path);
      saveNativeFile(
        project,
        id,
        path,
        final.content.replaceAll(
          '"text": "Not implemented yet."',
          `"text": ${runtime === 'node' ? 'String(calls)' : 'str(calls)'}`
        ),
        final.revision
      );
    }
    const config = JSON.parse(
      readFileSync(join(root, 'forge.project.json'), 'utf8')
    );
    const opened = await manager.open(project.id, root, config.sources);
    expect(opened.status).toBe('ready');
    for (const runtime of ['node', 'python'] as const) {
      const id = `shared_${runtime}`;
      const invoke = (
        kind: 'tool' | 'resource' | 'prompt',
        name: string,
        args = {}
      ) =>
        manager.invoke(project.id, opened.generation, id, {
          kind,
          name,
          arguments: args
        }) as Promise<any>;
      expect(
        (await invoke('tool', `${id}_greet`, { name: 'Diego' })).content[0]
          .text
      ).toBe('Hello, Diego!');
      expect(
        (await invoke('prompt', `${id}_prompts`)).messages[0].content.text
      ).toBe('1');
      await invoke('tool', `${id}_greet`, { name: 'Again' });
      expect(
        (await invoke('prompt', `${id}_prompts`)).messages[0].content.text
      ).toBe('2');
      expect(
        (await invoke('resource', `mcpack://${id}/${id}_resources`))
          .contents[0].text
      ).toBe('2');
      expect(
        (await invoke('resource', `mcpack://${id}/guide`)).contents[0].text
      ).toBe('Your native MCPack guide.');
      expect(
        (await invoke('prompt', `${id}_welcome`, { name: 'Diego' }))
          .messages[0].content.text
      ).toBe('Welcome Diego');
      expect((await invoke('tool', `${id}_tools`)).isError).toBe(true);
    }
  } finally {
    await manager.close();
    close();
  }
}, 30_000);

test('shared-handler creation refuses stale previews, manifest drift and invalid definitions before changing files', () => {
  const { project, close } = fixture();
  try {
    createNativeSource(project, 'shared', 'node');
    const manifest = readNativeFile(
      project,
      'shared',
      'native/shared/mcpack.json'
    );
    const preview = previewNativeHandler(
      project,
      'shared',
      'prompts',
      'review',
      'main',
      manifest.revision
    );
    const options = {
      worker: 'main',
      newWorker: false,
      addHandler: true,
      revision: manifest.revision,
      workerRevision: preview.revision
    };
    expect(() =>
      createNativeCapability(
        project,
        'shared',
        'node',
        'prompts',
        'review',
        'Review',
        { ...options, workerRevision: undefined }
      )
    ).toThrow('Preview');
    expect(() =>
      createNativeCapability(
        project,
        'shared',
        'node',
        'prompts',
        'review',
        42 as any,
        options
      )
    ).toThrow();
    expect(readNativeFile(project, 'shared', preview.path).content).toBe(
      preview.original
    );
    saveNativeFile(
      project,
      'shared',
      preview.path,
      preview.original + '\n// IDE edit\n',
      preview.revision
    );
    expect(() =>
      createNativeCapability(
        project,
        'shared',
        'node',
        'prompts',
        'review',
        'Review',
        options
      )
    ).toThrow('Worker changed');
    expect(readNativeFile(project, 'shared', preview.path).content).toEndWith(
      '// IDE edit\n'
    );
    expect(readNativeFile(project, 'shared', manifest.path).content).toBe(
      manifest.content
    );
    saveNativeFile(
      project,
      'shared',
      manifest.path,
      manifest.content + '\n',
      manifest.revision
    );
    expect(() =>
      previewNativeHandler(
        project,
        'shared',
        'prompts',
        'review',
        'main',
        manifest.revision
      )
    ).toThrow('Manifest changed');
    expect(nativeDocument(project, 'shared').files).toHaveLength(2);
  } finally {
    close();
  }
});

test('single-capability starters use requested names for every kind and runtime', async () => {
  const { createNativeCapability } =
    await import('../../src/lib/server/sources/authoring');
  const { project, root, close } = fixture();
  const manager = new ProjectSourceManager();
  try {
    for (const runtime of ['node', 'python'] as const) {
      for (const kind of ['tools', 'resources', 'prompts'] as const) {
        const id = `${runtime}_${kind}`;
        // A Python keyword is a valid public MCP name; generated code must still load.
        const name =
          runtime === 'python' && kind === 'tools'
            ? 'class'
            : `${id}-example`;
        createNativeCapability(
          project,
          id,
          runtime,
          kind,
          name,
          'User-created item'
        );
        const code = readFileSync(
          join(
            root,
            `native/${id}/handlers.${runtime === 'node' ? 'mjs' : 'py'}`
          ),
          'utf8'
        );
        expect(code).toContain(name);
        expect(code).not.toContain('greet');
      }
    }
    const config = JSON.parse(
      readFileSync(join(root, 'forge.project.json'), 'utf8')
    );
    const opened = await manager.open(project.id, root, config.sources);
    expect(opened.status).toBe('ready');
    for (const runtime of ['node', 'python'] as const) {
      for (const kind of ['tools', 'resources', 'prompts'] as const) {
        const id = `${runtime}_${kind}`;
        const name =
          runtime === 'python' && kind === 'tools'
            ? 'class'
            : `${id}-example`;
        const result = (await manager.invoke(
          project.id,
          opened.generation,
          id,
          {
            kind:
              kind === 'tools'
                ? 'tool'
                : kind === 'resources'
                  ? 'resource'
                  : 'prompt',
            name: kind === 'resources' ? `mcpack://${id}/${name}` : name,
            arguments: {}
          }
        )) as any;
        if (kind === 'tools') expect(result.isError).toBe(true);
        if (kind === 'resources')
          expect(result.contents[0].uri).toBe(`mcpack://${id}/${name}`);
        if (kind === 'prompts')
          expect(result.messages[0].content.text).toBe(
            'Not implemented yet.'
          );
      }
    }
  } finally {
    await manager.close();
    close();
  }
}, 30_000);
