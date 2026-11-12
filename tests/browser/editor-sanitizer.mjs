import assert from "node:assert/strict";

export async function verifyEditorSanitizer(page) {
  // Exercise the exact relative import in Monaco through Vite, not just the
  // standalone npm package: Monaco also ships a vendored vulnerable copy.
  const source = await page.request.get(
    "/node_modules/monaco-editor/esm/vs/base/browser/domSanitize.js",
  );
  assert.equal(source.ok(), true);
  assert.match(
    await source.text(),
    /\/node_modules\/dompurify\/dist\/purify\.es\.mjs/,
  );
  const result = await page.evaluate(async () => {
    const module =
      await import("/node_modules/monaco-editor/esm/vs/base/browser/domSanitize.js");
    const html = module.sanitizeHtml(
      '<img src="x" onerror="alert(1)"><script>alert(1)</script><b>safe</b>',
    );
    return String(html);
  });
  assert.match(result, /<b>safe<\/b>/);
  assert.doesNotMatch(result, /onerror|<script/i);
}
