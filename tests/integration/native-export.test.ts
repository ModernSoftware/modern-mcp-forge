import {
  capabilityKey,
  exportContents
} from '../../src/lib/deployment/selection';
import { expect, test } from 'bun:test';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nativeStarter } from '../../src/lib/server/sources/starter';
import {
  exportPack,
  previewExport
} from '../../src/lib/server/deployment/native-export';
import {
  createTempDirectory,
  createManifest,
  removeTempDirectory
} from '../helpers/project';

test('native export enforces the preview and includes only selected deployable files and capabilities', async () => {
  const dir = createTempDirectory();
  try {
    const project = createManifest();
    project.sources = [
      {
        id: 'local',
        kind: 'native',
        enabled: true,
        manifest: 'native/mcpack.json',
        disabledCapabilities: [{ kind: 'tools', name: 'local_greet' }]
      },
      {
        id: 'off',
        kind: 'native',
        enabled: false,
        manifest: 'native/off/pack.json'
      },
      {
        id: 'upstream',
        kind: 'external',
        enabled: true,
        url: 'https://example.com/mcp',
        bearerTokenEnv: 'UPSTREAM_TOKEN'
      }
    ];
    const folder = join(dir, 'native');
    mkdirSync(join(folder, 'off'), { recursive: true });
    mkdirSync(join(folder, 'node_modules'));
    const starter = nativeStarter('local', 'node');
    const source = {
      ...starter.manifest,
      workers: {
        main: {
          ...starter.manifest.workers.main,
          env: { API_KEY: 'secret-test-value' },
          inheritEnv: ['REGION']
        },
        dormant: { runtime: 'node', module: 'dormant.mjs' }
      }
    };
    const original = JSON.stringify(source);
    writeFileSync(join(folder, 'mcpack.json'), original);
    writeFileSync(join(folder, starter.module), starter.code);
    for (const path of [
      'dormant.mjs',
      'rules.txt',
      'unselected.txt',
      'off/pack.json',
      '.env.local',
      'server.key',
      'node_modules/debug.js'
    ])
      writeFileSync(join(folder, path), 'fixture');
    if (process.platform !== 'win32')
      symlinkSync(join(folder, '.env.local'), join(folder, 'innocent.txt'));
    const preview = await previewExport(dir, project, 'local');
    const keys = preview.capabilities.map(capabilityKey);
    expect(keys).toEqual(['resources/local_guide', 'prompts/local_welcome']);
    expect([...exportContents(preview, keys).required]).toEqual([
      starter.module
    ]);
    for (const invalid of [[], ['tools/local_greet'], ['tools/unknown']]) {
      await expect(
        exportPack(dir, project, 'local', preview.revision, [], invalid)
      ).rejects.toThrow();
    }
    const one = await exportPack(
      dir,
      project,
      'local',
      preview.revision,
      [],
      ['prompts/local_welcome']
    );
    const selected = JSON.parse(
      await (await new Bun.Archive(one).files()).get('pack/mcpack.json')!.text()
    );
    expect(selected.resources).toEqual([]);
    expect(selected.prompts.map((p: { name: string }) => p.name)).toEqual([
      'local_welcome'
    ]);
    expect(preview.files.map((f) => f.path)).not.toContain('innocent.txt');
    for (const path of [
      '../rules.txt',
      '.env.local',
      'off/pack.json',
      'server.key',
      'node_modules/debug.js'
    ]) {
      expect(
        preview.files.map((f) => f.path),
        path
      ).not.toContain(path);
      await expect(
        exportPack(dir, project, 'local', preview.revision, [path]),
        path
      ).rejects.toThrow();
    }
    await expect(previewExport(dir, project, 'off')).rejects.toThrow(
      'enabled native'
    );
    await expect(previewExport(dir, project, 'upstream')).rejects.toThrow(
      'enabled native'
    );
    const blob = await exportPack(dir, project, 'local', preview.revision, [
      'rules.txt'
    ]);
    const entries = await new Bun.Archive(blob).files();
    const names = [...entries.keys()].sort();
    expect(names).toEqual([
      'README.md',
      'pack/handlers.mjs',
      'pack/mcpack.json',
      'pack/rules.txt',
      'package-lock.json',
      'package.json'
    ]);
    const output = JSON.parse(await entries.get('pack/mcpack.json')!.text());
    expect(output.tools).toEqual([]);
    expect(Object.keys(output.workers)).toEqual(['main']);
    expect(output.workers.main.env).toEqual({});
    expect(output.workers.main.inheritEnv).toEqual(['REGION', 'API_KEY']);
    expect(JSON.stringify(output)).not.toContain('secret-test-value');
    expect(await entries.get('README.md')!.text()).not.toContain(
      'secret-test-value'
    );
    expect(readFileSync(join(folder, 'mcpack.json'), 'utf8')).toEqual(original);
    writeFileSync(join(folder, 'rules.txt'), 'changed after preview');
    await expect(
      exportPack(dir, project, 'local', preview.revision, ['rules.txt'])
    ).rejects.toThrow('changed');
  } finally {
    removeTempDirectory(dir);
  }
});

test('exports nested imports per selected worker and blocks missing or excluded helpers', async () => {
  const dir = createTempDirectory();
  try {
    const project = createManifest();
    project.sources = [
      {
        id: 'local',
        kind: 'native',
        enabled: true,
        manifest: 'native/mcpack.json'
      }
    ];
    const folder = join(dir, 'native');
    mkdirSync(join(folder, 'services'), { recursive: true });
    const starter = nativeStarter('local', 'node');
    const source = {
      ...starter.manifest,
      workers: {
        ...starter.manifest.workers,
        other: { runtime: 'node', module: './other.mjs' }
      },
      tools: [
        ...starter.manifest.tools,
        { ...starter.manifest.tools[0], name: 'other_greet', worker: 'other' }
      ]
    };
    writeFileSync(join(folder, 'mcpack.json'), JSON.stringify(source));
    writeFileSync(
      join(folder, starter.module),
      "import './services/customer-service.mjs';\n" + starter.code
    );
    writeFileSync(
      join(folder, 'services/customer-service.mjs'),
      "export * from './nested.mjs';\n"
    );
    writeFileSync(
      join(folder, 'services/nested.mjs'),
      'export const synthetic = true;\n'
    );
    writeFileSync(
      join(folder, 'other.mjs'),
      "import './services/unselected.mjs';\n"
    );
    writeFileSync(
      join(folder, 'services/unselected.mjs'),
      'export const other = true;\n'
    );
    let preview = await previewExport(dir, project, 'local');
    const selected = ['tools/local_greet'];
    expect([...exportContents(preview, selected).required].sort()).toEqual([
      'handlers.mjs',
      'services/customer-service.mjs',
      'services/nested.mjs'
    ]);
    const archive = await exportPack(
      dir,
      project,
      'local',
      preview.revision,
      [],
      selected
    );
    const entries = await new Bun.Archive(archive).files();
    expect(entries.has('pack/services/customer-service.mjs')).toBe(true);
    expect(entries.has('pack/services/nested.mjs')).toBe(true);
    expect(entries.has('pack/services/unselected.mjs')).toBe(false);

    writeFileSync(
      join(folder, 'services/nested.mjs'),
      "import './missing.mjs';\n"
    );
    await expect(
      exportPack(dir, project, 'local', preview.revision, [], selected)
    ).rejects.toThrow('source changed');
    preview = await previewExport(dir, project, 'local');
    await expect(
      exportPack(dir, project, 'local', preview.revision, [], selected)
    ).rejects.toThrow('missing or excluded');
    // A broken unselected worker must not block a valid selection.
    const other = await exportPack(
      dir,
      project,
      'local',
      preview.revision,
      [],
      ['tools/other_greet']
    );
    expect(
      (await new Bun.Archive(other).files()).has(
        'pack/services/unselected.mjs'
      )
    ).toBe(true);

    writeFileSync(join(folder, '.secret.mjs'), 'export const secret = true;');
    const excluded = ['../.secret.mjs'];
    if (process.platform !== 'win32') {
      symlinkSync(
        join(folder, '.secret.mjs'),
        join(folder, 'services/link.mjs')
      );
      excluded.push('./link.mjs');
    }
    for (const path of excluded) {
      writeFileSync(
        join(folder, 'services/nested.mjs'),
        `import ${JSON.stringify(path)};`
      );
      preview = await previewExport(dir, project, 'local');
      await expect(
        exportPack(dir, project, 'local', preview.revision, [], selected)
      ).rejects.toThrow('missing or excluded');
    }
  } finally {
    removeTempDirectory(dir);
  }
});
