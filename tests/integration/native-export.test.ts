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
    expect(preview.counts).toEqual({ tools: 0, resources: 1, prompts: 1 });
    expect(preview.files.filter((f) => f.required).map((f) => f.path)).toEqual([
      starter.module
    ]);
    expect(preview.files.map((f) => f.path)).not.toContain('innocent.txt');
    for (const path of [
      '../rules.txt',
      '.env.local',
      'off/pack.json',
      'server.key',
      'node_modules/debug.js'
    ])
      await expect(
        exportPack(dir, project, 'local', preview.revision, [path])
      ).rejects.toThrow();
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
