import type { NativeCatalog, NativeKind } from '../mcpack/session';
import type { ProjectSource } from './schema';

export type SourceCatalog = NativeCatalog;
export interface SourceCall {
  kind: NativeKind;
  name: string;
  arguments: Record<string, unknown>;
  signal?: AbortSignal;
}
export interface SourceAdapter {
  start(): Promise<void>;
  discover(): Promise<SourceCatalog>;
  invoke(call: SourceCall): Promise<unknown>;
  health(): { status: 'starting' | 'ready' | 'failed' | 'stopped'; error?: string };
  close(): Promise<void>;
}
export type SourceFactory = (root: string, source: ProjectSource) => SourceAdapter;
