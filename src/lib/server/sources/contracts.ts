import type { ExecutionOrigin } from '../../execution-origin';
import type { NativeCatalog, NativeKind } from '../mcpack/session';
import type { ProjectSource } from './schema';

export type SourceCatalog = NativeCatalog;
export interface SourceCall {
  kind: NativeKind;
  name: string;
  arguments: Record<string, unknown>;
  signal?: AbortSignal;
  origin?: ExecutionOrigin;
}
export interface SourceAdapter {
  start(): Promise<void>;
  originalIdentity?(kind: keyof SourceCatalog, route: string): string;
  discover(): Promise<SourceCatalog>;
  invoke(call: SourceCall): Promise<unknown>;
  health(): {
    status: 'starting' | 'ready' | 'failed' | 'stopped';
    error?: string;
  };
  filesChanged?(): Promise<boolean>;
  diagnostics?(): string;
  close(): Promise<void>;
}
export type SourceFactory = (
  root: string,
  source: ProjectSource
) => SourceAdapter;
