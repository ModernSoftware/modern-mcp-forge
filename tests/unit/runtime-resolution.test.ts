import { describe, expect, test } from 'bun:test';

import { resolveNodeCommand } from '$lib/server/execution/node-command';
import { resolvePythonCommand } from '$lib/server/execution/python-command';
import { getRuntimeStatus } from '$lib/server/workbench/runtime-status';

describe('runtime resolution', () => {
  test('Bun runtime reports the current executable', () => {
    const status = getRuntimeStatus('bun');
    expect(status.ready).toBe(true);
    expect(status.detail).toBe(process.execPath);
  });

  test('Node resolution reflects PATH availability', () => {
    const expected = Bun.which('node');

    if (expected) {
      expect(resolveNodeCommand()).toEqual({
        executable: expected,
        prefixArgs: []
      });
      expect(getRuntimeStatus('node').ready).toBe(true);
    } else {
      expect(() => resolveNodeCommand()).toThrow('Node.js runtime not found');
      expect(getRuntimeStatus('node').ready).toBe(false);
    }
  });

  test('Python resolution reflects supported launchers on PATH', () => {
    const candidates = process.platform === 'win32'
      ? [Bun.which('py'), Bun.which('python'), Bun.which('python3')]
      : [Bun.which('python'), Bun.which('python3'), Bun.which('py')];

    if (candidates.some(Boolean)) {
      const resolved = resolvePythonCommand();
      expect(resolved.executable.length).toBeGreaterThan(0);
      expect(getRuntimeStatus('python').ready).toBe(true);
    } else {
      expect(() => resolvePythonCommand()).toThrow('Python 3 runtime not found');
      expect(getRuntimeStatus('python').ready).toBe(false);
    }
  });

  test('dotnet status never throws even when dotnet is absent', () => {
    const status = getRuntimeStatus('dotnet');
    expect(typeof status.ready).toBe('boolean');
    expect(status.detail.length).toBeGreaterThan(0);
  });
});
