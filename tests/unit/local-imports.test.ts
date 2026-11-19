import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { localImportScanner } from '../../src/lib/server/deployment/local-imports';

function scan(files: Record<string, string>, entry = 'handlers.mjs') {
  const reads: string[] = [];
  const inspect = localImportScanner(
    resolve('synthetic-pack'),
    new Set(Object.keys(files)),
    (path) => {
      reads.push(path);
      return files[path];
    }
  );
  return { ...inspect(entry), reads };
}

test('follows ESM imports, re-exports and literal dynamic imports without executing code', () => {
  const result = scan({
    'handlers.mjs': `
      import { service } from './services/customer-service.mjs';
      import pg from 'pg';
      import 'node:fs';
      // import './not-a-dependency.mjs';
      const text = "import './also-not-a-dependency.mjs'";
      throw new Error('Must never execute this module');
    `,
    'services/customer-service.mjs': `
      export { service } from './nested/service.js';
      export * from '../shared.mjs';
      const get = () => import('./lazy%20helper.mjs?version=1#fragment');
    `,
    'services/nested/service.js':
      "import '../../shared.mjs'; export const service = true;",
    'services/nested/package.json': '{"type":"module"}',
    'services/lazy helper.mjs':
      "import data from './data.json' with { type: 'json' };",
    'services/data.json': '{"synthetic":true}',
    'shared.mjs': "import './handlers.mjs';",
    'unused.mjs': "import './missing.mjs';"
  });
  expect(result.imports).toEqual([
    'services/customer-service.mjs',
    'services/data.json',
    'services/lazy helper.mjs',
    'services/nested/package.json',
    'services/nested/service.js',
    'shared.mjs'
  ]);
  expect(result.errors).toEqual([]);
  expect(result.warnings).toEqual([]);
  expect(new Set(result.reads).size).toBe(result.reads.length);
  expect(result.reads).not.toContain('unused.mjs');
});

test('reports unresolved local imports without reading beyond the allowed inventory', () => {
  for (const dependency of [
    './missing.mjs',
    '../outside.mjs',
    './.env',
    './link.mjs',
    './%2e%2e/outside.mjs'
  ]) {
    const result = scan({
      'handlers.mjs': `import ${JSON.stringify(dependency)};`
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('missing or excluded');
    expect(result.reads).toEqual(['handlers.mjs']);
    expect(result.imports).toEqual([]);
  }
});

test('makes manual dependency detection limits visible', () => {
  const result = scan({
    'handlers.mjs': `
      import './legacy.cjs';
      import '#local-alias';
      const load = (path) => import(path);
    `,
    'legacy.cjs': "module.exports = require('./helper');"
  });
  expect(result.warnings.join('\n')).toContain('computed import');
  expect(result.warnings.join('\n')).toContain('aliased import');
  expect(result.warnings.join('\n')).toContain('require()');
  expect(result.imports).toEqual(['legacy.cjs']);
  expect(
    scan({ 'handlers.mjs': 'not valid JavaScript !' }).warnings[0]
  ).toContain('could not be inspected');
});

test('retains package scope for a nested entry module with no imports', () => {
  expect(
    scan({
      'workers/entry.js': 'export const createWorker = () => ({});',
      'workers/package.json': '{"type":"module"}'
    }, 'workers/entry.js').imports
  ).toEqual(['workers/package.json']);
});
