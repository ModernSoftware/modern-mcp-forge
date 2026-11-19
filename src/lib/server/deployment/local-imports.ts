import { parse, type Node } from 'acorn';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type Analysis = { imports: string[]; warnings: string[]; errors: string[] };

/** Inspect source only: never import or execute application code during export. */
export function localImportScanner(
  folder: string,
  available: ReadonlySet<string>,
  read: (path: string) => string
) {
  const cache = new Map<string, Analysis>();

  function inspect(path: string): Analysis {
    const cached = cache.get(path);
    if (cached) return cached;
    const result: Analysis = { imports: [], warnings: [], errors: [] };
    cache.set(path, result);
    // Preserve package scopes for entry modules as well as imported helpers.
    for (let dir = dirname(path); dir !== '.'; dir = dirname(dir)) {
      const pkg = dir.split(sep).join('/') + '/package.json';
      if (pkg !== path && available.has(pkg)) result.imports.push(pkg);
    }
    // JSON and other imported assets are copied, not parsed as JavaScript.
    if (!/\.[cm]?js$/i.test(path)) return result;
    const source = read(path);
    let ast: Node;
    try {
      ast = parse(source, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        allowReturnOutsideFunction: path.endsWith('.cjs')
      });
    } catch {
      result.warnings.push(
        `${path}: JavaScript could not be inspected. Select its helper files manually.`
      );
      return result;
    }

    function dependency(value: unknown) {
      if (typeof value !== 'string') {
        result.warnings.push(
          `${path}: computed import needs manual file selection.`
        );
        return;
      }
      if (!/^\.\.?\//.test(value)) {
        if (/^(?:[./#]|[a-z]+:)/i.test(value) && !value.startsWith('node:'))
          result.warnings.push(
            `${path}: an absolute, URL or aliased import needs deployment review.`
          );
        // Package dependencies are installed from the exported package files.
        return;
      }
      let target: string;
      try {
        const url = new URL(value, pathToFileURL(join(folder, path)));
        target = relative(folder, fileURLToPath(url)).split(sep).join('/');
      } catch {
        result.errors.push(
          `${path}: invalid local import ${JSON.stringify(value)}.`
        );
        return;
      }
      if (!available.has(target)) {
        result.errors.push(
          `${path}: local import ${JSON.stringify(value)} is missing or excluded from export.`
        );
        return;
      }
      result.imports.push(target);
    }

    const pending = [ast];
    while (pending.length) {
      const node = pending.pop()!;
      if (
        node.type === 'ImportDeclaration' ||
        node.type === 'ExportNamedDeclaration' ||
        node.type === 'ExportAllDeclaration' ||
        node.type === 'ImportExpression'
      ) {
        const source = (node as Node & { source?: { value?: unknown } })
          .source;
        if (source) dependency(source.value);
      }
      if (node.type === 'CallExpression') {
        const callee = (
          node as Node & {
            callee: { name?: string; property?: { name?: string } };
          }
        ).callee;
        if (callee.name === 'require' || callee.property?.name === 'require')
          result.warnings.push(
            `${path}: require() dependencies need manual file selection.`
          );
      }
      for (const value of Object.values(node)) {
        for (const child of Array.isArray(value) ? value : [value]) {
          if (
            child &&
            typeof child === 'object' &&
            typeof child.type === 'string'
          )
            pending.push(child);
        }
      }
    }
    return result;
  }

  return (entry: string): Analysis => {
    const seen = new Set<string>();
    const pending = [entry];
    const warnings = new Set<string>();
    const errors = new Set<string>();
    while (pending.length) {
      const path = pending.pop()!;
      if (seen.has(path)) continue;
      seen.add(path);
      const result = inspect(path);
      pending.push(...result.imports);
      for (const warning of result.warnings) warnings.add(warning);
      for (const error of result.errors) errors.add(error);
    }
    seen.delete(entry);
    return {
      imports: [...seen].sort(),
      warnings: [...warnings].sort(),
      errors: [...errors].sort()
    };
  };
}
