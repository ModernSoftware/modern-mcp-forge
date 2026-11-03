import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { externalServer } from '../helpers/external-server';
import { getAvailablePort } from '../helpers/network';

const dir = await mkdtemp(join(tmpdir(), 'forge tool arguments '));
process.env.MCP_FORGE_DB_PATH = join(dir, 'forge.db');
const lab = resolve('examples/bridges/compatibility-lab');
const remote = externalServer();
const port = await getAvailablePort();
const base = 'http://127.0.0.1:' + port;
const vite = await createServer({
  server: { host: '127.0.0.1', port, strictPort: true },
  logLevel: 'error'
});
const post = (path, body) =>
  fetch(base + '/api/' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
let browser;
try {
  // The lab setup installs decimal.js alongside the real Node and Python workers.
  await cp(join(lab, 'native'), join(dir, 'native'), { recursive: true });
  const project = JSON.parse(
    await readFile(join(lab, 'forge.project.json'), 'utf8')
  );
  const reflected = {
    type: 'object',
    properties: {
      label: { type: 'string' },
      count: { type: 'integer' },
      enabled: { type: 'boolean' }
    }
  };
  const union = {
    type: 'object',
    properties: { value: { oneOf: [{ type: 'string' }, { type: 'number' }] } },
    required: ['value']
  };
  await writeFile(
    join(dir, 'adapter.mjs'),
    `export default {
    listTools() { return ${JSON.stringify([
      { name: 'reflect', inputSchema: reflected },
      { name: 'variant', inputSchema: union }
    ])}; },
    callTool({arguments: args}) { return {content:[{type:'text',text:JSON.stringify(args)}]}; },

  };`
  );
  project.sources = [
    project.sources.find((s) => s.kind === 'native'),
    {
      id: 'mirror',
      kind: 'bridge',
      enabled: true,
      runtime: 'node',
      mode: 'adapter',
      entrypoint: 'adapter.mjs'
    },
    {
      id: 'orders',
      kind: 'external',
      enabled: true,
      naming: 'collisions',
      url: remote.url
    }
  ];
  await writeFile(join(dir, 'forge.project.json'), JSON.stringify(project));
  await vite.listen();
  const opened = await post('projects/open', { folderPath: dir });
  assert.equal(opened.status, 200, await opened.text());
  const state = await (await fetch(base + '/api/project/sources')).json();
  for (const source of state.sources)
    assert.equal(source.status, 'ready', source.error);
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_BIN ||
      Bun.which('google-chrome') ||
      Bun.which('chromium'),
    headless: true,
    args: ['--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const go = async (path) => {
    await page.goto(base + path);
    await page.waitForLoadState('networkidle');
  };
  const editor = page.getByRole('group', {
    name: 'Tool arguments',
    exact: true
  });
  const toggle = editor.getByRole('switch', { name: 'Edit as JSON' });
  const raw = editor.getByLabel('Arguments (JSON)');
  const run = page.getByRole('button', { name: /^Run( request)?$/ });
  const field = (role, name) =>
    editor.getByRole(role, { name: new RegExp('^' + name + '\\b') });
  const invoke = async (source, args) => {
    const response = page.waitForResponse(
      (r) =>
        r.url() === base + '/api/project/' + source &&
        r.request().postDataJSON()?.action === 'invoke'
    );
    await run.click();
    const r = await response;
    assert.equal(r.status(), 200);
    assert.deepEqual(r.request().postDataJSON().arguments, args);
    const payload = await r.json();
    const output = page
      .locator('pre')
      .filter({ hasText: JSON.stringify(payload.result, null, 2) });
    await output.first().waitFor();
    return payload.result;
  };

  await go('/workspace/native/order-desk/tools/get_quote_by_sku');
  await page.getByRole('tab', { name: 'Test', exact: true }).click();
  assert.equal(await run.isDisabled(), true);
  await field('textbox', 'sku').fill('ACT-42');
  await field('spinbutton', 'quantity').fill('1001');
  assert.equal(await run.isDisabled(), true);
  await field('spinbutton', 'quantity').fill('3');
  await field('combobox', 'tier').selectOption({ label: 'premium' });
  const quote = { sku: 'ACT-42', quantity: 3, tier: 'premium' };
  const result = await invoke('native', quote);
  assert.equal(result.structuredContent.total, '59.93');
  await toggle.focus();
  await page.keyboard.press('Space');
  assert.deepEqual(JSON.parse(await raw.inputValue()), quote);
  await raw.fill('{"sku":');
  assert.equal(await run.isDisabled(), true);
  assert.equal(await toggle.isDisabled(), true);
  assert.equal(await raw.inputValue(), '{"sku":');
  await raw.fill(JSON.stringify(quote));
  assert.deepEqual(await invoke('native', quote), result);
  await toggle.uncheck();
  await editor.getByRole('button', { name: 'Omit tier' }).click();
  await toggle.check();
  assert.deepEqual(JSON.parse(await raw.inputValue()), {
    sku: 'ACT-42',
    quantity: 3
  });

  await go('/workspace/native/order-desk/tools/estimate_delivery');
  await page.getByRole('tab', { name: 'Test', exact: true }).click();
  await field('textbox', 'orderedAtLocal').fill('2026-10-30T16:00');
  await field('combobox', 'service').selectOption({ label: 'express' });
  await editor.getByRole('button', { name: 'Add item to parcels' }).click();
  await field('spinbutton', 'kg').fill('0');
  assert.equal(await run.isDisabled(), true);
  await editor.getByText('/parcels/0/kg', { exact: true }).waitFor();
  await field('spinbutton', 'kg').fill('2');
  await editor.getByRole('button', { name: 'Add item to parcels' }).click();
  await editor.getByRole('button', { name: 'Remove parcels item 2' }).click();
  const delivery = {
    orderedAtLocal: '2026-10-30T16:00',
    service: 'express',
    parcels: [{ kg: 2 }]
  };
  assert.equal(
    (await invoke('native', delivery)).structuredContent.deliveryDate,
    '2026-11-04'
  );
  await toggle.check();
  assert.deepEqual(JSON.parse(await raw.inputValue()), delivery);

  await go('/project/bridge/mirror?kind=tool&name=reflect');
  await toggle.check();
  const preserved = { label: 'test', count: 0, enabled: false, extra: null };
  await raw.fill(JSON.stringify(preserved));
  await toggle.uncheck();
  await field('textbox', 'label').fill('');
  preserved.label = '';
  const reflectedResult = await invoke('bridge', preserved);
  await toggle.check();
  assert.deepEqual(await invoke('bridge', preserved), reflectedResult);
  await page.getByLabel('Capability', { exact: true }).selectOption('variant');
  assert.equal(await toggle.isDisabled(), true);
  assert.equal(await raw.inputValue(), '{}');
  await editor.getByText(/uses oneOf/).waitFor();
  await raw.fill('{"value":false}');
  assert.equal(await run.isDisabled(), true);
  await raw.fill('{"value":0}');
  await invoke('bridge', { value: 0 });

  await go('/project/external/orders?kind=tool&name=lookup');
  await field('textbox', 'id').fill('42');
  const lookup = { filter: { id: '42' } };
  const order = await invoke('external', lookup);
  assert.equal(order.content[0].text, 'Order 42');
  await toggle.check();
  assert.deepEqual(await invoke('external', lookup), order);
  await go('/project/native/order-desk');
  await page
    .getByLabel('Capability', { exact: true })
    .selectOption('get_quote_by_sku');
  await toggle.check();
  await raw.fill(JSON.stringify(quote));
  assert.deepEqual(await invoke('native', quote), result);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: form and JSON send equivalent typed arguments through native, bridge and external routes.'
  );
} finally {
  await browser?.close();
  await post('projects/close', {}).catch(() => {});
  (await vite.ssrLoadModule('/src/lib/server/database.ts')).closeDatabase();
  await vite.close();
  remote.close();
  await rm(dir, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100
  });
}
