import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { nativeFileStamp } from './native-files';
import { NativeProjectError, NativeProjectManager } from '../mcpack/session';
import type { SourceAdapter, SourceCall } from './contracts';

export class NativeSourceAdapter implements SourceAdapter {
  private manager = new NativeProjectManager();
  private manifest?: string;
  private loadedStamp?: string;
  constructor(
    private root: string,
    private filename: string
  ) {}

  async start() {
    const root = await realpath(this.root);
    const manifest = await realpath(
      resolve(root, this.filename.replaceAll('\\', '/'))
    );
    const rel = relative(root, manifest);
    if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) {
      throw new Error('Native source manifest must remain inside the project.');
    }
    // Stamp before startup so a concurrent edit is detected on the next test.
    this.loadedStamp = await nativeFileStamp(manifest).catch(() => undefined);
    const opened = await this.manager.open(manifest);
    if (opened?.status !== 'ready')
      throw new Error(opened?.error ?? 'Source failed to start.');
    this.manifest = opened.manifestPath;
  }

  async discover() {
    this.manager.connection().assertReady();
    return this.manager.snapshot()!.catalog;
  }

  invoke(call: SourceCall) {
    if (!this.manifest) throw new Error('Source is not started.');
    return this.manager.invoke(
      this.manifest,
      call.kind,
      call.name,
      call.arguments,
      call.signal
    );
  }

  async assertTestFilesCurrent() {
    if (!this.manifest)
      throw new NativeProjectError('Start the source before testing.', 409);
    if (this.loadedStamp === undefined)
      throw new NativeProjectError(
        'Forge could not check this source for external edits. Check folder access and reload sources.',
        409
      );
    const current = await nativeFileStamp(this.manifest).catch(() => undefined);
    if (this.loadedStamp !== current)
      throw new NativeProjectError(
        'Files changed on disk since this worker started. Reload files & restart sources before testing.',
        409
      );
  }

  diagnostics() {
    return this.manager.snapshot()?.diagnostics ?? '';
  }

  health() {
    const state = this.manager.snapshot();
    return {
      status: state?.status ?? ('stopped' as const),
      error: state?.error
    };
  }

  async close() {
    await this.manager.close();
    this.manifest = undefined;
  }
}
