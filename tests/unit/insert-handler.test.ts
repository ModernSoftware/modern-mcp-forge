import { expect, test } from 'bun:test';
import { insertNativeHandler } from '../../src/lib/server/sources/insert-handler';
import {
  nativeStarter,
  capabilityStarter
} from '../../src/lib/server/sources/starter';

function insert(
  source: string,
  runtime: 'node' | 'python',
  kind: 'tools' | 'resources' | 'prompts' = 'prompts',
  name = 'review-order',
  factory?: string
) {
  return insertNativeHandler({
    source,
    runtime,
    kind,
    name,
    factory:
      factory ?? (runtime === 'node' ? 'createWorker' : 'create_worker'),
    cwd: process.cwd()
  });
}

test('Node insertion preserves comments and nested handler code, supports missing and existing groups', () => {
  const original = `export function createWorker(context) {
  const shared = { text: '}', pattern: /[{}]/ }; // Keep this initialization.
  return {
    // Keep this handler, including its braces and trailing comma.
    tools: { async old() { return { content: [{ text: shared.text }] }; }, },
    shutdown() { /* keep cleanup */ }
  };
}
`;
  const result = insert(original, 'node');
  expect(result).toContain('async ["review-order"]');
  expect(result).toContain('shutdown() { /* keep cleanup */ }');
  expect(result).toContain(
    original.slice(original.indexOf('    // Keep this handler'))
  );
  const added = insert(result, 'node', 'tools', 'new-tool');
  expect(added).toContain('async ["new-tool"]');
  expect(added).toContain(
    'async old() { return { content: [{ text: shared.text }] }; },'
  );
  expect(() => insert(added, 'node', 'tools', 'new-tool')).toThrow(
    'already exists'
  );
  const empty = insert(
    'export const build = () => ({ tools: {} });',
    'node',
    'tools',
    'class',
    'build'
  );
  expect(empty).toContain('async ["class"]');
  expect(
    insert(
      'export default function () { return {}; }',
      'node',
      'resources',
      'guide',
      'default'
    )
  ).toContain('resources:');
});

test('Node insertion rejects dynamic factories and ambiguous registries without guessing', () => {
  for (const source of [
    'export function createWorker() { return registry; }',
    'export function createWorker() { return { ...registry }; }',
    'export function createWorker() { return { prompts: registry }; }',
    'export function createWorker() { return { prompts: { ...handlers } }; }',
    'export function createWorker() { if (x) return {}; return {}; }',
    'export function createWorker() { return { [kind]: {} }; }',
    'export function createWorker() { return { prompts: {}, prompts: {} }; }',
    'export function createWorker() { return { get prompts() { return {}; } }; }'
  ])
    expect(() => insert(source, 'node')).toThrow('cannot safely');
  expect(() => insert('export function createWorker() {', 'node')).toThrow(
    'syntax'
  );
});

test('Python insertion preserves CRLF, Unicode, comments, shared dependencies and avoids local-name collisions', () => {
  const original = `raise RuntimeError("Preview must not execute me")
def create_worker(context):
    label = "café 🦜"
    handle_review_order = label
    def old(args, call):
        return {"messages": []}
    return {"prompts": {"old": old}, # Keep this comment.
            "shutdown": lambda: None}
`.replaceAll('\n', '\r\n');
  const result = insert(original, 'python');
  expect(result).toContain('def handle_review_order_2(args, call):\r\n');
  expect(result).toContain('"review-order": handle_review_order_2,');
  expect(result).toContain('"old": old}, # Keep this comment.');
  expect(result).toContain('label = "café 🦜"\r\n');
  expect(result.replaceAll('\r\n', '')).not.toContain('\n');
  expect(() => insert(result, 'python')).toThrow('already exists');
  const unicode = insert(
    'def create_worker(context):\n    return {"é🦜": 1, "tools": {}}\n',
    'python',
    'tools',
    'class'
  );
  expect(unicode).toContain('"class": handle_class');
  expect(unicode).toContain('"é🦜": 1');
  const tabs = insert(
    'def build(context):\n\treturn {}\n',
    'python',
    'resources',
    'guide',
    'build'
  );
  expect(tabs).toContain('\tdef handle_guide(args, call):\n\t\tcall.signal');
});

test('Python insertion rejects dynamic factories, duplicate keys and conditional returns', () => {
  for (const source of [
    'def create_worker(context):\n    return registry\n',
    'def create_worker(context):\n    return {**registry}\n',
    'def create_worker(context):\n    return {"prompts": registry}\n',
    'def create_worker(context):\n    return {"prompts": {**handlers}}\n',
    'def create_worker(context):\n    return {"prompts": {}, "prompts": {}}\n',
    'def create_worker(context):\n    if context:\n        return {}\n    return {}\n',
    'def create_worker(context): return {}\n',
    '@decorate\ndef create_worker(context):\n    return {}\n'
  ])
    expect(() => insert(source, 'python')).toThrow('cannot safely');
});

test('all generated starter shapes accept additional tools, resources and prompts', () => {
  for (const runtime of ['node', 'python'] as const) {
    for (const initial of ['tools', 'resources', 'prompts'] as const) {
      let source = capabilityStarter(
        'sample',
        runtime,
        initial,
        'first'
      ).code;
      for (const kind of ['tools', 'resources', 'prompts'] as const)
        source = insert(source, runtime, kind, `added-${kind}`);
      expect(source).toContain('added-prompts');
    }
    expect(insert(nativeStarter('sample', runtime).code, runtime)).toContain(
      'review-order'
    );
  }
});
