import { verifySourcePaths } from './source-paths.mjs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { getAvailablePort } from '../helpers/network';
const port = await getAvailablePort();
const dir = await mkdtemp(join(tmpdir(), 'forge-browser-export-')),
  base = 'http://127.0.0.1:' + port;
process.env.MCP_FORGE_DB_PATH = join(dir, 'db');
const vite = await createServer({
  server: { host: '127.0.0.1', port, strictPort: true },
  logLevel: 'error'
});
let browser;
const post = (p, value) =>
  fetch(base + '/api/' + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value)
  });
try {
  await vite.listen();
  assert.equal(
    (
      await post('projects/create', {
        name: 'Browser Demo',
        folderPath: join(dir, 'demo')
      })
    ).status,
    201
  );
  const p = await (await fetch(base + '/api/project/sources')).json();
  const create = await post('project/native', {
    projectId: p.project,
    generation: p.generation,
    action: 'create',
    runtime: 'node',
    id: 'demo'
  });
  assert.equal(create.status, 200, await create.text());
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_BIN ||
      Bun.which('google-chrome') ||
      Bun.which('chromium'),
    args: ['--disable-dev-shm-usage'],
    headless: true
  });
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // A new Forge process retains the SQLite selection but owns no live workers.
  const { projectSources } = await vite.ssrLoadModule(
    '/src/lib/server/sources/manager.ts'
  );
  await projectSources.close();
  await page.goto(base + '/projects');
  await page.waitForLoadState('networkidle');
  assert.equal(projectSources.snapshot().status, 'stopped');
  const resume = async () => {
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL('**/workspace');
    assert.equal(projectSources.snapshot().status, 'ready');
    assert.equal(await page.getByRole('alert').count(), 0);
  };
  // Keep the real worker in startup until the dialog has shown its source.
  const worker = join(dir, 'demo', 'native', 'demo', 'handlers.mjs');
  const original = await readFile(worker, 'utf8');
  const gate = join(dir, 'startup-ready');
  await writeFile(
    worker,
    `
    import { existsSync } from 'node:fs';
    const deadline = Date.now() + 12000;
    while (!existsSync(${JSON.stringify(gate)}) && Date.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 50));
    ` + original
  );
  await page.getByRole('button', { name: 'Continue' }).click();
  const opening = page.getByRole('dialog', { name: 'Opening Browser Demo' });
  await opening.getByText(/Discovering capabilities from demo/).waitFor();
  await writeFile(gate, '');
  await page.waitForURL('**/workspace');
  assert.equal(await opening.count(), 0);
  assert.equal(projectSources.snapshot().status, 'ready');
  const generation = projectSources.snapshot().generation;
  await page.goto(base + '/projects');
  await page.waitForLoadState('networkidle');
  await resume();
  assert.equal(projectSources.snapshot().generation, generation);
  // A genuine failure remains visible and clears after a successful retry.
  await writeFile(worker, 'throw new Error("broken fixture");');
  await page.goto(base + '/project');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Reload sources' }).click();
  await page.getByRole('alert').first().waitFor();
  await writeFile(worker, original);
  await page.getByRole('button', { name: 'Reload sources' }).click();
  await page.getByRole('button', { name: 'Reload sources' }).waitFor();
  assert.equal(projectSources.snapshot().status, 'ready');
  assert.equal(await page.getByRole('alert').count(), 0);
  await page.getByRole('link', { name: 'Open workspace' }).click();
  await page.getByRole('link', { name: 'Export native pack' }).waitFor();
  await page.waitForLoadState('networkidle');
  const kind = page.getByLabel('Capability type'),
    type = page.getByLabel('Source type'),
    view = page.getByLabel('Workspace view'),
    search = page.getByPlaceholder('Name, description or source');
  await kind.selectOption('tools');
  await type.selectOption('native');
  await search.fill('greet');
  await view.selectOption('grouped');
  await page.locator('details.catalog-group summary').first().click();
  const check = async () => {
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="Workspace view"]')?.value ===
        'grouped'
    );
    assert.equal(await kind.inputValue(), 'tools');
    assert.equal(await type.inputValue(), 'native');
    assert.equal(await search.inputValue(), 'greet');
    assert.equal(
      await page.locator('details.catalog-group').first().getAttribute('open'),
      ''
    );
  };
  await check();
  await page.getByRole('link', { name: 'Export native pack' }).click();
  await page.getByRole('heading', { name: 'Export native pack' }).waitFor();
  const downloadButton = page.getByRole('button', { name: 'Download .tar.gz' });
  for (const name of ['demo_greet', 'demo_guide', 'demo_welcome']) {
    const box = page.getByRole('checkbox', { name, exact: true });
    assert.equal(await box.isChecked(), true);
    await box.uncheck();
  }
  assert.equal(await downloadButton.isDisabled(), true);
  await page.getByRole('checkbox', { name: 'demo_guide', exact: true }).check();
  await page.getByRole('button', { name: 'Refresh preview' }).click();
  await page.waitForFunction(
    () => !document.querySelector('.actions button')?.disabled
  );
  assert.equal(
    await page.getByRole('checkbox', { name: 'demo_greet' }).isChecked(),
    false
  );
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download .tar.gz' }).click()
  ]);
  assert.equal(download.suggestedFilename(), 'demo-native.tar.gz');
  const output = join(dir, 'download.tar.gz');
  await download.saveAs(output);
  const files = await new Bun.Archive(await readFile(output)).files();
  assert.ok(files.has('pack/handlers.mjs'));
  assert.ok(files.has('pack/package.json'));
  const manifest = JSON.parse(await files.get('pack/mcpack.json').text());
  assert.deepEqual(manifest.tools, []);
  assert.deepEqual(manifest.prompts, []);
  assert.deepEqual(
    manifest.resources.map((r) => r.name),
    ['demo_guide']
  );
  await page.getByRole('link', { name: '← Workspace' }).click();
  await check();
  await page.reload();
  await check();
  await view.selectOption('detailed');
  await view.selectOption('grouped');
  await check();
  await post('projects/close', {});
  await post('projects/create', {
    name: 'Second project',
    folderPath: join(dir, 'second')
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  assert.equal(await view.inputValue(), 'detailed');
  assert.equal(await search.inputValue(), '');
  assert.equal(await kind.inputValue(), 'all');
  await verifySourcePaths(page, join(dir, 'second'));
  assert.deepEqual(errors, []);
  console.log(
    'Chromium PASS: actual archive download, filters, search, grouping, expansion, navigation, reload, project isolation.'
  );
} finally {
  if (browser) await browser.close();
  await post('projects/close', {}).catch(() => {});
  (await vite.ssrLoadModule('/src/lib/server/database.ts')).closeDatabase();
  await vite.close();
  await rm(dir, { recursive: true, force: true });
}
