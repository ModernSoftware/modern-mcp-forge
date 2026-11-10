import {
  parse,
  type Node,
  type ObjectExpression,
  type Property
} from 'acorn';
import { spawnSync } from 'node:child_process';
import { NativeProjectError } from '../mcpack/session';
import { resolvePythonCommand } from '../execution/python-command';
import { handlerStarter } from './starter';
import { pythonInsertion } from './insert-handler-python';

const unsupported =
  'Forge cannot safely add a handler to this factory. It needs a single direct return of an object/dictionary with literal handler groups. Add the handler manually and choose “Use an existing handler”, or create a new worker.';

function reject(): never {
  throw new NativeProjectError(unsupported);
}

function propertyName(property: Property) {
  if (!property.computed && property.key.type === 'Identifier')
    return property.key.name;
  if (
    property.key.type === 'Literal' &&
    typeof property.key.value === 'string'
  )
    return property.key.value;
  return reject();
}

function properties(object: ObjectExpression) {
  const found = new Map<string, Property>();
  for (const property of object.properties) {
    if (property.type !== 'Property') reject();
    const name = propertyName(property);
    if (found.has(name)) reject();
    found.set(name, property);
  }
  return found;
}

// Skip nested handlers when counting the factory's own return statements.
function returns(node: Node): Node[] {
  if (node.type === 'ReturnStatement') return [node];
  if (/Function|Class/.test(node.type)) return [];
  return Object.values(node).flatMap((value) => {
    const children = Array.isArray(value) ? value : [value];
    return children.flatMap((child) =>
      child && typeof child === 'object' && typeof child.type === 'string'
        ? returns(child)
        : []
    );
  });
}

function insertNode(
  source: string,
  factoryName: string,
  kind: string,
  handler: string,
  snippet: string
) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const factories = ast.body.flatMap((statement) => {
    if (
      statement.type === 'ExportDefaultDeclaration' &&
      factoryName === 'default'
    ) {
      const value = statement.declaration;
      return value.type === 'FunctionDeclaration' ||
        value.type === 'ArrowFunctionExpression' ||
        value.type === 'FunctionExpression'
        ? [value]
        : [];
    }
    if (statement.type !== 'ExportNamedDeclaration' || !statement.declaration)
      return [];
    const declaration = statement.declaration;
    if (
      declaration.type === 'FunctionDeclaration' &&
      declaration.id?.name === factoryName
    )
      return [declaration];
    if (declaration.type !== 'VariableDeclaration') return [];
    return declaration.declarations.flatMap((item) =>
      item.id.type === 'Identifier' &&
      item.id.name === factoryName &&
      item.init &&
      (item.init.type === 'ArrowFunctionExpression' ||
        item.init.type === 'FunctionExpression')
        ? [item.init]
        : []
    );
  });
  if (factories.length !== 1 || factories[0].generator) reject();
  const body = factories[0].body;
  let registry: ObjectExpression;
  if (body.type === 'ObjectExpression') registry = body;
  else if (body.type === 'BlockStatement') {
    const last = body.body.at(-1);
    if (
      last?.type !== 'ReturnStatement' ||
      last.argument?.type !== 'ObjectExpression' ||
      returns(body).length !== 1
    )
      reject();
    registry = last.argument;
  } else reject();
  const group = properties(registry).get(kind);
  if (
    group &&
    (group.kind !== 'init' ||
      group.method ||
      group.value.type !== 'ObjectExpression')
  )
    reject();
  const target = group ? (group.value as ObjectExpression) : registry;
  if (group && properties(target).has(handler))
    throw new NativeProjectError(
      `Handler "${handler}" already exists under ${kind}. Choose “Use an existing handler” to bind it.`
    );
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lineIndent = (position: number) =>
    /^[\t ]*/.exec(
      source.slice(source.lastIndexOf('\n', position - 1) + 1)
    )![0];
  const parentIndent = lineIndent(target.start);
  const first = target.properties[0];
  const existingIndent = first ? lineIndent(first.start) : '';
  const unit =
    parentIndent.includes('\t') || existingIndent.includes('\t')
      ? '\t'
      : '  ';
  const indent =
    existingIndent.length > parentIndent.length
      ? existingIndent
      : parentIndent + unit;
  const indentSnippet = (text: string, prefix: string) =>
    text
      .split('\n')
      .map(
        (line) =>
          prefix +
          line.replace(/^(?:  )+/g, (spaces) =>
            unit.repeat(spaces.length / 2)
          )
      )
      .join(eol);
  const addition = group
    ? indentSnippet(snippet, indent)
    : `${indent}${kind}: {${eol}${indentSnippet(snippet, indent + unit)}${eol}${indent}}`;
  // Insert at the opening brace so existing comments, trailing commas and code stay intact.
  const inserted =
    eol +
    addition +
    (first
      ? ',' +
        (source.slice(target.start + 1, first.start).includes('\n')
          ? ''
          : eol + indent)
      : eol + parentIndent);
  const content =
    source.slice(0, target.start + 1) +
    inserted +
    source.slice(target.start + 1);
  parse(content, { ecmaVersion: 'latest', sourceType: 'module' });
  return content;
}

/** Parse source only. Never import or execute the developer's worker to generate a preview. */
export function insertNativeHandler(input: {
  source: string;
  runtime: 'node' | 'python';
  factory: string;
  kind: 'tools' | 'resources' | 'prompts';
  name: string;
  executable?: string;
  cwd: string;
}) {
  const snippet = handlerStarter(input.runtime, input.kind, input.name);
  try {
    if (input.runtime === 'node')
      return insertNode(
        input.source,
        input.factory,
        input.kind,
        input.name,
        snippet
      );
    const command = input.executable
      ? { executable: input.executable, prefixArgs: [] }
      : resolvePythonCommand();
    // Isolated stdlib parsing ignores project imports and site customizations.
    const result = spawnSync(
      command.executable,
      [...command.prefixArgs, '-I', '-S', '-c', pythonInsertion],
      {
        cwd: input.cwd,
        input: JSON.stringify({ ...input, snippet }),
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true
      }
    );
    if (result.error || result.status !== 0)
      throw new NativeProjectError(
        'Python could not parse this worker. Check its configured Python executable, or create/bind the handler manually.'
      );
    const parsed = JSON.parse(result.stdout) as {
      content?: string;
      error?: string;
    };
    if (parsed.error === 'unsupported') reject();
    if (parsed.error) throw new NativeProjectError(parsed.error);
    if (typeof parsed.content !== 'string') reject();
    return parsed.content;
  } catch (error) {
    if (NativeProjectError.is(error)) throw error;
    throw new NativeProjectError(
      'The worker could not be parsed. Fix its syntax before adding a handler, or use an existing handler.'
    );
  }
}
