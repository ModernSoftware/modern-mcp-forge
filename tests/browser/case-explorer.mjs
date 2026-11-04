import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// Called by tool-arguments.mjs with its live native/bridge/external fixtures.
export async function verifyCaseExplorer({ page, post, readSources, base }) {
  const state = await readSources();
  const api = async (body) => {
    const r = await post('project/cases', {
      projectId: state.project,
      generation: state.generation,
      ...body
    });
    const data = await r.json();
    assert.equal(r.status, 200, JSON.stringify(data));
    return data;
  };
  let saved = await api({ action: 'list' });
  const extra = [
    {
      name: 'Mirror mismatch',
      source: 'mirror',
      sourceKind: 'bridge',
      tool: 'reflect',
      arguments: { label: 'fixture' },
      expect: {
        mode: 'success',
        fields: [{ path: '/content/0/text', value: 'different' }]
      }
    },
    {
      name: 'Remote order',
      source: 'orders',
      sourceKind: 'external',
      tool: 'lookup',
      arguments: { filter: { id: '42' } },
      expect: {
        mode: 'success',
        fields: [{ path: '/content/0/text', value: 'Order 42' }]
      }
    },
    {
      name: 'Invalid order',
      source: 'orders',
      sourceKind: 'external',
      tool: 'lookup',
      arguments: { filter: { id: 42 } },
      expect: { mode: 'invalid-input', path: '/filter/id' }
    }
  ];
  for (const definition of extra)
    saved = await api({
      action: 'save',
      revision: saved.revision,
      definition
    });
  await page.reload();
  const rows = page
    .getByRole('group', { name: 'Test cases', exact: true })
    .getByRole('article');
  await rows.nth(4).waitFor();
  const type = page.getByLabel('Source type', { exact: true });
  const source = page.getByLabel('Source', { exact: true });
  const result = page.getByLabel('Result', { exact: true });
  const search = page.getByLabel('Search cases', { exact: true });
  const selectAll = page.getByRole('button', {
    name: 'Select all visible',
    exact: true
  });
  const deselect = page.getByRole('button', {
    name: 'Deselect all',
    exact: true
  });
  const run = page.getByRole('button', { name: /^Run selected/ });
  const requests = [];
  const record = (r) => {
    if (
      r.url() === base + '/api/project/cases' &&
      r.postDataJSON()?.action === 'run'
    )
      requests.push(r.postDataJSON());
  };
  page.on('request', record);
  let confirmations = 0;
  const confirm = (d) => {
    confirmations++;
    return d.accept();
  };
  page.on('dialog', confirm);
  try {
    await selectAll.click();
    assert.equal(await run.textContent(), 'Run selected (5)');
    await type.selectOption('bridge');
    assert.equal(await rows.count(), 2);
    assert.equal(await run.textContent(), 'Run selected (2)');
    await run.click();
    await page
      .getByText(/Finished · 2 of 2 cases · 1 passed · 1 failed/)
      .waitFor();
    assert.equal(confirmations, 1);
    assert.deepEqual(
      requests.map((r) => r.id),
      saved.cases.filter((c) => c.source === 'mirror').map((c) => c.id)
    );
    const mismatch = rows.filter({ hasText: 'Mirror mismatch' });
    await mismatch
      .getByText('Expected and actual (1)', { exact: true })
      .click();
    assert.match(
      await mismatch.locator('pre').textContent(),
      /Expected "different"/
    );
    assert.match(await mismatch.locator('pre').textContent(), /fixture/);

    await type.selectOption('all');
    await run.click();
    await page
      .getByText(/Finished · 5 of 5 cases · 4 passed · 1 failed/)
      .waitFor();
    assert.equal(confirmations, 2);
    assert.equal(requests.length, 7);
    await result.selectOption('failed');
    assert.equal(await rows.count(), 1);
    assert.match(await rows.first().textContent(), /Mirror mismatch/);
    await result.selectOption('all');
    await source.selectOption('orders');
    assert.equal(await rows.count(), 2);
    await search.fill('Invalid');
    assert.equal(await rows.count(), 1);
    await search.fill('no matching case');
    await page
      .getByText('No matching cases. Change your search or filters.')
      .waitFor();
    assert.equal(await run.isDisabled(), true);
    await search.fill('');
    await deselect.click();
    assert.equal(await run.textContent(), 'Run selected (0)');

    // Filters survive navigating away, but selection never auto-runs anything.
    await page.getByRole('link', { name: '← Workspace', exact: true }).click();
    const actions = page.getByRole('group', { name: 'Project actions' });
    for (const width of [1280, 1920]) {
      await page.setViewportSize({ width, height: 950 });
      const boxes = await actions.getByRole('link').evaluateAll((nodes) =>
        nodes.map((n) => ({
          y: n.getBoundingClientRect().top,
          h: n.getBoundingClientRect().height
        }))
      );
      assert.equal(boxes.length, 7);
      assert.equal(
        new Set(boxes.map((b) => b.y)).size,
        1,
        'Desktop actions stay in one row'
      );
      assert.equal(
        new Set(boxes.map((b) => b.h)).size,
        1,
        'Desktop actions have equal height'
      );
    }
    await capture(page, 'workspace');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      'Workspace actions fit mobile'
    );
    await capture(page, 'workspace-mobile');
    await page.setViewportSize({ width: 1280, height: 800 });
    await actions.getByRole('link', { name: 'Named test cases' }).click();
    await rows.nth(1).waitFor();
    assert.equal(await source.inputValue(), 'orders');
    assert.equal(await rows.count(), 2);
    assert.equal(await run.textContent(), 'Run selected (0)');
    assert.equal(
      await rows.locator('[data-status="passed"]').count(),
      2,
      'Verdicts survive navigation'
    );
    await source.selectOption('all');
    await selectAll.click();
    await capture(page, 'cases');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      'Case explorer fits mobile'
    );
    await capture(page, 'cases-mobile');
    await page.setViewportSize({ width: 1280, height: 800 });

    // Hold the first request while the user stops; let it complete normally.
    // Only that case can run, with no cancellation/retry of the live tool call.
    const held = Promise.withResolvers();
    const release = Promise.withResolvers();
    let intercepted = 0;
    const stopGate = async (route) => {
      if (route.request().postDataJSON()?.action === 'run') {
        intercepted++;
        if (intercepted === 1) {
          held.resolve();
          await release.promise;
        }
      }
      await route.continue();
    };
    await page.route('**/api/project/cases', stopGate);
    await run.click();
    await held.promise;
    await page
      .getByRole('button', { name: 'Stop after current case', exact: true })
      .click();
    release.resolve();
    await page
      .getByText(/Stopped · 1 of 5 cases · 1 passed · 0 failed/)
      .waitFor();
    assert.equal(intercepted, 1);
    await page.unroute('**/api/project/cases', stopGate);

    // A stale source generation stops the batch before any later case is sent.
    let rejected = 0;
    const stale = async (route) => {
      if (route.request().postDataJSON()?.action !== 'run')
        return route.continue();
      rejected++;
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Project sources changed. Refresh before continuing.'
        })
      });
    };
    await page.route('**/api/project/cases', stale);
    await run.click();
    await page
      .getByText(/Stopped · 1 of 5 cases · 0 passed · 0 failed · 1 run errors/)
      .waitFor();
    assert.equal(rejected, 1);
    await page.unroute('**/api/project/cases', stale);
    await page.getByRole('button', { name: 'Refresh cases' }).click();
    await rows.locator('[data-status="error"]').waitFor({ state: 'detached' });
    await deselect.click();
  } finally {
    page.off('request', record);
    page.off('dialog', confirm);
  }
  console.log(
    'PASS: filtered multi-source case selection, batch verdicts, saved filters, stop, stale-run guard and responsive workspace/explorer.'
  );
}

export async function capture(page, name) {
  if (!process.env.FORGE_UI_SCREENSHOTS) return;
  await mkdir(process.env.FORGE_UI_SCREENSHOTS, { recursive: true });
  for (let i = 0; i < 2; i++) {
    const theme =
      (await page.locator('html').getAttribute('data-theme')) || 'light';
    await page.screenshot({
      path: join(process.env.FORGE_UI_SCREENSHOTS, name + '-' + theme + '.png'),
      animations: 'disabled',
      fullPage: true
    });
    await page
      .getByRole('button', { name: /^Switch to (light|dark) theme$/ })
      .click();
  }
}
