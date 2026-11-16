import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function verifyNativeRehearsal(page, project) {
  const base = new URL(page.url()).origin;
  const workspace = async () => {
    await page.goto(base + '/workspace');
    await page.waitForLoadState('networkidle');
  };
  await workspace();
  await page.getByRole('link', { name: 'Add prompt', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('review_topic');
  await page
    .getByRole('button', { name: 'Create prompt', exact: true })
    .click();
  await page.waitForURL(
    '**/workspace/native/review_topic/prompts/review_topic'
  );
  await page.getByRole('button', { name: 'Add argument' }).click();
  await page.getByLabel('Argument name', { exact: true }).fill('topic');
  await page
    .locator('.prompt-row')
    .getByLabel('Description')
    .fill('Subject to review');
  await page.getByRole('checkbox', { name: 'Required', exact: true }).check();
  const saveDefinition = page.getByRole('button', {
    name: 'Save definition',
    exact: true
  });
  await saveDefinition.click();
  await page
    .getByText(
      'Definition saved. Project sources restarted; reconnect external MCP clients.',
      { exact: true }
    )
    .waitFor();
  const mode = page.getByRole('switch', { name: 'Edit as JSON' });
  await mode.check();
  await page
    .locator('.monaco-editor .view-lines')
    .getByText(/topic/)
    .first()
    .waitFor();
  await mode.uncheck();
  assert.equal(
    await page.getByLabel('Argument name', { exact: true }).inputValue(),
    'topic'
  );
  assert.equal(await saveDefinition.isDisabled(), true);
  const manifest = JSON.parse(
    await readFile(join(project, 'native/review_topic/mcpack.json'), 'utf8')
  );
  assert.deepEqual(manifest.prompts[0].arguments, [
    { name: 'topic', description: 'Subject to review', required: true }
  ]);

  await page.getByRole('tab', { name: 'Test', exact: true }).click();
  const inputs = page.getByRole('group', {
    name: 'Prompt arguments',
    exact: true
  });
  const run = page.getByRole('button', { name: 'Run', exact: true });
  assert.equal(await run.isDisabled(), true);
  await inputs.getByRole('textbox', { name: /^topic\b/ }).fill('inventory');
  await inputs.getByRole('switch', { name: 'Edit as JSON' }).check();
  const json = inputs.getByLabel('Arguments (JSON)');
  assert.deepEqual(JSON.parse(await json.inputValue()), {
    topic: 'inventory'
  });
  await json.fill('{"topic":{"temperature":0.6}}');
  assert.equal(await run.isDisabled(), true);
  await inputs.getByRole('list', { name: 'Argument validation' }).waitFor();
  await json.fill('{"topic":"inventory"}');
  await inputs.getByRole('switch', { name: 'Edit as JSON' }).uncheck();
  assert.equal(
    await inputs.getByRole('textbox', { name: /^topic\b/ }).inputValue(),
    'inventory'
  );
  await run.click();
  await page.getByRole('region', { name: 'Request result' }).waitFor();

  // Distinct edits in Forge and on disk must preserve both until the user reloads.
  await page.getByRole('tab', { name: 'Code', exact: true }).click();
  const worker = join(project, 'native/review_topic/handlers.mjs');
  const original = await readFile(worker, 'utf8');
  const draft = original.replace('Not implemented yet.', 'Forge draft');
  const disk = original.replace('Not implemented yet.', 'Saved in IDE');
  // Monaco may use Chrome's EditContext instead of the fallback textarea.
  // Apply a real model edit through its public API so onChange marks the draft.
  await page.locator('.monaco-editor .view-lines').waitFor();
  await page.evaluate(async (text) => {
    const { monaco } = await import('/src/lib/client/monaco.ts');
    const editor = monaco.editor
      .getEditors()
      .find((item) => item.getModel()?.getLanguageId() === 'javascript');
    if (!editor?.getModel())
      throw new Error('JavaScript editor was not ready');
    editor.executeEdits('rehearsal', [
      { range: editor.getModel().getFullModelRange(), text }
    ]);
  }, draft);
  await page.getByRole('tab', { name: 'Code *', exact: true }).waitFor();
  await writeFile(worker, disk);
  const conflictResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/project/native') &&
      r.request().postDataJSON()?.action === 'save'
  );
  await page.getByRole('button', { name: 'Save code', exact: true }).click();
  assert.equal((await conflictResponse).status(), 409);
  await page.getByRole('region', { name: 'File conflict' }).waitFor();
  assert.equal(await readFile(worker, 'utf8'), disk);
  const editorText = () =>
    page.evaluate(async () => {
      const { monaco } = await import('/src/lib/client/monaco.ts');
      return monaco.editor
        .getEditors()
        .find((item) => item.getModel()?.getLanguageId() === 'javascript')
        ?.getValue();
    });
  // Monaco virtualizes lines outside the viewport. Compare the complete model.
  assert.equal(await editorText(), draft);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reload disk version' }).click();
  await page
    .getByText(
      'Reading files from disk and restarting project sources. This can take a moment while workers and connected servers start.',
      { exact: true }
    )
    .waitFor();
  await page
    .getByText(
      'Files reloaded and project sources restarted. Reconnect any external MCP clients.',
      { exact: true }
    )
    .waitFor();
  assert.equal(
    await page.getByRole('region', { name: 'File conflict' }).count(),
    0
  );
  assert.equal(await editorText(), disk);
  assert.equal(
    await page
      .getByRole('button', { name: 'Save code', exact: true })
      .isDisabled(),
    true
  );

  // A new Python resource in an existing source gets executable code automatically.
  await workspace();
  await page.getByRole('link', { name: 'Add resource', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('support_guide');
  await page
    .getByLabel('Source', { exact: true })
    .selectOption('review_topic');
  assert.equal(await page.getByLabel('Implementation').inputValue(), 'add');
  await page.getByLabel('Implementation').selectOption('create');
  assert.equal(
    await page.getByLabel('New worker ID').inputValue(),
    'support_guide'
  );
  await page.getByLabel('Worker runtime').selectOption('python');
  await page
    .getByRole('button', { name: 'Create resource', exact: true })
    .click();
  await page.waitForURL(
    '**/workspace/native/review_topic/resources/support_guide'
  );
  assert.equal(await page.getByRole('alert').count(), 0);
  assert.match(
    await readFile(
      join(project, 'native/review_topic/support_guide.py'),
      'utf8'
    ),
    /def create_worker/
  );
  await page.getByRole('tab', { name: 'Test', exact: true }).click();
  await run.click();
  await page.getByRole('region', { name: 'Request result' }).waitFor();
  await page.getByRole('tab', { name: 'Definition', exact: true }).click();
  // Add capabilities to both existing modules without allocating another worker.
  for (const [kind, name, workerId, module] of [
    ['prompt', 'shared_review', 'main', 'handlers.mjs'],
    ['resource', 'shared_guide', 'main', 'handlers.mjs'],
    ['tool', 'shared_python_tool', 'support_guide', 'support_guide.py'],
    ['prompt', 'shared_python_prompt', 'support_guide', 'support_guide.py']
  ]) {
    await workspace();
    await page
      .getByRole('link', { name: new RegExp(`Add ${kind}$`) })
      .click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
    await page
      .getByLabel('Source', { exact: true })
      .selectOption('review_topic');
    await page.getByLabel('Worker', { exact: true }).selectOption(workerId);
    assert.equal(await page.getByLabel('Worker runtime').count(), 0);
    const path = join(project, 'native/review_topic', module);
    const before = await readFile(path, 'utf8');
    const declaration = join(project, 'native/review_topic/mcpack.json');
    const manifestBefore = await readFile(declaration, 'utf8');
    await page
      .getByRole('button', { name: 'Preview handler', exact: true })
      .click();
    await page
      .getByRole('region', { name: 'Worker change preview' })
      .waitFor();
    assert.equal(await readFile(path, 'utf8'), before);
    assert.equal(await readFile(declaration, 'utf8'), manifestBefore);
    const createdResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/project/native') &&
        response.request().postDataJSON()?.action === 'create-capability'
    );
    await page
      .getByRole('button', { name: `Create ${kind}`, exact: true })
      .click();
    const created = await createdResponse;
    const payload = await created.json();
    assert.equal(created.status(), 200, JSON.stringify(payload));
    assert.equal(payload.snapshot.status, 'ready', JSON.stringify(payload));
    await page.waitForURL(
      `**/workspace/native/review_topic/${kind}s/${name}`
    );
    // Monaco keeps two screen-reader announcement nodes after its preview closes.
    const errors = await page
      .locator('[role="alert"]:not(.monaco-alert)')
      .allTextContents();
    assert.deepEqual(
      errors,
      [],
      `Unexpected alerts for ${name}: ${errors.join('\n')}`
    );
    const updated = JSON.parse(await readFile(declaration, 'utf8'));
    assert.deepEqual(updated.workers, JSON.parse(manifestBefore).workers);
    assert.equal(
      updated[`${kind}s`].find((item) => item.name === name).worker,
      workerId
    );
    assert.match(await readFile(path, 'utf8'), new RegExp(name));
    await page.getByRole('tab', { name: 'Test', exact: true }).click();
    await run.click();
    await page.getByRole('region', { name: 'Request result' }).waitFor();
  }
  // Manual binding remains available and must not alter the module.
  await workspace();
  await page.getByRole('link', { name: 'Add prompt', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('reuse_review');
  await page
    .getByLabel('Source', { exact: true })
    .selectOption('review_topic');
  await page.getByLabel('Implementation').selectOption('existing');
  await page.getByLabel('Existing handler name').fill('shared_review');
  const beforeBinding = await readFile(worker, 'utf8');
  await page
    .getByRole('button', { name: 'Create prompt', exact: true })
    .click();
  await page.waitForURL(
    '**/workspace/native/review_topic/prompts/reuse_review'
  );
  assert.equal(await readFile(worker, 'utf8'), beforeBinding);
  if (process.env.FORGE_UI_SCREENSHOTS) {
    await mkdir(process.env.FORGE_UI_SCREENSHOTS, { recursive: true });
    await page.screenshot({
      path: join(process.env.FORGE_UI_SCREENSHOTS, 'native-resource.png'),
      fullPage: true
    });
  }
  console.log(
    'Chromium PASS: visual prompts, Form/JSON validation, conflict recovery, new worker creation, previewed shared Node/Python handlers and existing-handler bindings.'
  );
}
