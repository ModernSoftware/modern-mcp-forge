import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function verifySourcePaths(page, project) {
  await mkdir(join(project, 'apps', 'deploy'), { recursive: true });
  await mkdir(join(project, 'bridges'), { recursive: true });
  await writeFile(join(project, 'apps', 'deploy', 'built.txt'), 'ready');
  await writeFile(
    join(project, 'bridges', 'deploy.mjs'),
    `
    import { readFileSync } from 'node:fs';
    readFileSync('built.txt', 'utf8');
    export default {
      listTools: () => [{name: 'rollout', inputSchema: {type:'object', properties:{}}}],
      callTool: () => ({content:[{type:'text',text:'ready'}]})
    };`
  );

  // Enter through the hydrated workspace, so the first form interaction is
  // handled by Svelte instead of changing an SSR select before hydration.
  await page.waitForLoadState('networkidle');
  await page.getByRole('link', { name: 'Bridge existing implementation' }).click();
  await page.waitForURL('**/workspace/connect?kind=bridge');
  await page.getByLabel('Bridge name').fill('deployment');
  await page.getByLabel('Adapter setup').selectOption('existing');
  const fileButton = page.getByRole('button', {
    name: 'Browse for Adapter file'
  });
  await fileButton.click();
  await page.keyboard.press('Escape');
  assert.ok(
    await fileButton.evaluate((button) => button === document.activeElement)
  );
  await fileButton.click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'bridges/', exact: true }).click();
  await dialog.getByRole('button', { name: 'deploy.mjs', exact: true }).click();
  assert.equal(
    await page
      .getByRole('textbox', { name: 'Adapter file', exact: true })
      .inputValue(),
    'bridges/deploy.mjs'
  );
  await page.getByRole('button', { name: 'Attach bridge' }).click();
  await page.getByText('Show startup details', { exact: true }).click();
  assert.match(
    await page.locator('.startup-details pre').innerText(),
    /built\.txt/
  );
  assert.equal(await page.getByLabel('Bridge name').inputValue(), 'deployment');
  await page
    .getByRole('button', { name: 'Browse for Working directory' })
    .click();
  await dialog.getByRole('button', { name: 'apps/', exact: true }).click();
  await dialog.getByRole('button', { name: 'deploy/', exact: true }).click();
  await dialog.getByRole('button', { name: 'Select this folder' }).click();
  assert.equal(
    await page
      .getByRole('textbox', { name: 'Working directory', exact: true })
      .inputValue(),
    'apps/deploy'
  );
  await page.getByRole('button', { name: 'Attach bridge' }).click();
  await page.waitForURL('**/project/bridge/deployment');
  await page.getByRole('heading', { name: 'Discovered catalog' }).waitFor();
  assert.ok((await page.locator('body').innerText()).includes('rollout'));
}
