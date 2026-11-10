import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { BridgeSourceAdapter } from '../../src/lib/server/sources/bridge';

test('aborting a bridge handshake releases the unresponsive child', async () => {
  const root = await mkdtemp(join(tmpdir(), 'forge-cancel-bridge-'));
  const adapter = new BridgeSourceAdapter(root, {
    kind: 'bridge',
    id: 'slow',
    enabled: true,
    runtime: 'node',
    entrypoint: 'slow.mjs'
  });
  const abort = new AbortController();
  try {
    await writeFile(
      join(root, 'slow.mjs'),
      "import {writeFileSync} from 'node:fs'; writeFileSync('pid', String(process.pid)); process.stdin.resume();"
    );
    const opening = adapter.start(abort.signal);
    const observed = opening.then(() => null, (error: unknown) => error);
    const deadline = Date.now() + 5000;
    while (!existsSync(join(root, 'pid')) && Date.now() < deadline)
      await sleep(20);
    const pid = Number(await readFile(join(root, 'pid'), 'utf8'));
    abort.abort();
    expect(await observed).toBeInstanceOf(Error);
    expect(() => process.kill(pid, 0)).toThrow();
  } finally {
    abort.abort();
    await adapter.close();
    await rm(root, { recursive: true, force: true });
  }
}, 10000);
