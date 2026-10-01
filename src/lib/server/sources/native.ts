import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { NativeProjectManager } from '../mcpack/session';
import type { SourceAdapter, SourceCall } from './contracts';

export class NativeSourceAdapter implements SourceAdapter {
  private manager = new NativeProjectManager();
  private manifest?: string;
  constructor(
    private root: string,
    private filename: string
  ) {}

  async start() {
    const root = await realpath(this.root);
    const manifest = await realpath(resolve(root, this.filename.replaceAll('\\', '/')));
    const rel = relative(root, manifest);
    if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) {
      throw new Error('Native source manifest must remain inside the project.');
    }
    const opened = await this.manager.open(manifest);
    if (opened?.status !== 'ready') throw new Error(opened?.error ?? 'Source failed to start.');
    this.manifest = opened.manifestPath;
  }

  async discover() {
    this.manager.connection().assertReady();
    return this.manager.snapshot()!.catalog;
  }

  invoke(call: SourceCall) {
    if (!this.manifest) throw new Error('Source is not started.');
    return this.manager.invoke(this.manifest, call.kind, call.name, call.arguments, call.signal);
  }

  health() {
    const state = this.manager.snapshot();
    return { status: state?.status ?? ('stopped' as const), error: state?.error };
  }

  async close() {
    await this.manager.close();
    this.manifest = undefined;
  }
}
