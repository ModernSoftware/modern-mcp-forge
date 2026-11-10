import { isDeepStrictEqual } from 'node:util';
import type {
  SourceAdapter,
  SourceCall,
  SourceCatalog,
  SourceFactory
} from './contracts';
import { publishCatalogs, type ReservedCatalog } from './public-names';
import {
  startToolExecution,
  completeToolExecution,
  failToolExecution,
  tryLogExecution
} from '../mcp/execution-log';
import { NativeProjectError } from '../mcpack/session';
import { discardConnectionDrafts } from './connection-drafts';
import { BridgeSourceAdapter } from './bridge';
import { ExternalSourceAdapter } from './external';
import { NativeSourceAdapter } from './native';
import { ProjectSourcesSchema, type ProjectSource } from './schema';

const nativeFactory: SourceFactory = (root, source) => {
  if (source.kind === 'external') return new ExternalSourceAdapter(source);
  if (source.kind === 'bridge') return new BridgeSourceAdapter(root, source);
  return new NativeSourceAdapter(root, source.manifest);
};

/** Owns the sources for one project selection, with generation-bound invocation. */
export class ProjectSourceManager {
  private pending: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private project?: string;
  private status: 'stopped' | 'starting' | 'ready' | 'failed' = 'stopped';
  private definitions: ProjectSource[] = [];
  private adapters = new Map<string, SourceAdapter>();
  private catalogs = new Map<string, SourceCatalog>();
  private published: ReturnType<typeof publishCatalogs> = new Map();
  private error?: string;
  private bridgeFailures = new Map<string, string>();
  private sourceFailures = new Map<string, string>();
  private failedSource?: { id: string; diagnostics: string };

  // Local authoring only. Worker output must never enter the public MCP catalog.
  diagnostics(project: string, source: string) {
    if (this.project !== project) return '';
    if (this.failedSource?.id === source) return this.failedSource.diagnostics;
    return this.bridgeFailures.get(source) ?? this.adapters.get(source)?.diagnostics?.() ?? '';
  }

  constructor(private factory: SourceFactory = nativeFactory) {}

  async testNative(
    project: string,
    generation: number,
    source: string,
    call: SourceCall
  ) {
    if (project !== this.project || generation !== this.generation)
      throw new Error('Project sources changed. Refresh before testing.');
    if (await this.adapters.get(source)?.filesChanged?.())
      throw new NativeProjectError(
        'Files changed on disk since this worker started. Reload files & restart sources before testing.',
        409
      );
    return this.invoke(project, generation, source, call);
  }

  private exclusive<T>(operation: () => Promise<T>) {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => {});
    return result;
  }

  startupProgress() {
    const enabled = this.definitions.filter((source) => source.enabled);
    const done = (id: string) =>
      this.catalogs.has(id) || this.sourceFailures.has(id);
    return {
      project: this.project ?? null,
      status: this.status,
      total: enabled.length,
      finished: enabled.filter((source) => done(source.id)).length,
      starting: enabled
        .filter((source) => this.adapters.has(source.id) && !done(source.id))
        .map((source) => source.id)
    };
  }

  snapshot() {
    return {
      project: this.project ?? null,
      generation: this.generation,
      status: this.status,
      error: this.error,
      sources: this.definitions.map((definition) => {
        const health = this.adapters.get(definition.id)?.health();
        const sourceError = this.sourceFailures.get(definition.id);
        const status =
          health?.status ??
          (!definition.enabled
            ? 'disabled'
            : sourceError || this.failedSource?.id === definition.id
              ? 'failed'
              : 'stopped');
        return {
          ...definition,
          status,
          error:
            sourceError ??
            health?.error ??
            (definition.kind === 'external' && status === 'failed'
              ? 'Connection lost. Reload or edit this connection.'
              : undefined),
          catalog:
            status === 'ready'
              ? structuredClone(
                  this.published.get(definition.id)?.catalog ?? {
                    tools: [],
                    resources: [],
                    prompts: []
                  }
                )
              : { tools: [], resources: [], prompts: [] }
        };
      })
    };
  }

  // The local tester addresses original identities, including hidden items. MCP
  // registration and public invocation use only the published catalog.
  inspect(source: string) {
    const adapter = this.adapters.get(source);
    const catalog = structuredClone(
      (adapter?.health().status === 'ready'
        ? this.catalogs.get(source)
        : undefined) ?? { tools: [], resources: [], prompts: [] }
    );
    const publication = this.published.get(source);
    const bindings: {
      kind: keyof SourceCatalog;
      identity: string;
      publicKey?: string;
      publicName?: string;
    }[] = [];
    for (const kind of ['tools', 'resources', 'prompts'] as const) {
      const exposed = new Map(
        (publication?.catalog[kind] ?? []).map((item) => [
          'uri' in item
            ? item.uri
            : kind === 'resources'
              ? item.name
              : (publication?.[kind].get(item.name) ?? item.name),
          item
        ])
      );
      for (const item of catalog[kind]) {
        const route = 'uri' in item ? item.uri : item.name;
        const identity = adapter?.originalIdentity?.(kind, route) ?? route;
        const publicItem = exposed.get(route);
        bindings.push({
          kind,
          identity,
          publicName: publicItem?.name,
          publicKey:
            publicItem &&
            ('uri' in publicItem ? publicItem.uri : publicItem.name)
        });
        if ('uri' in item) item.uri = identity;
        else item.name = identity;
      }
    }
    return { catalog, bindings };
  }

  private visibleCatalog(
    definition: ProjectSource,
    replacement?: SourceCatalog
  ): SourceCatalog {
    const catalog = structuredClone(
      replacement ??
        this.catalogs.get(definition.id) ?? {
          tools: [],
          resources: [],
          prompts: []
        }
    );
    if (definition.kind === 'native') {
      const hidden = definition.disabledCapabilities ?? [];
      catalog.tools = catalog.tools.filter(
        (item) =>
          !hidden.some(
            (entry) => entry.kind === 'tools' && entry.name === item.name
          )
      );
      catalog.resources = catalog.resources.filter(
        (item) =>
          !hidden.some(
            (entry) => entry.kind === 'resources' && entry.name === item.name
          )
      );
      catalog.prompts = catalog.prompts.filter(
        (item) =>
          !hidden.some(
            (entry) => entry.kind === 'prompts' && entry.name === item.name
          )
      );
    }
    return catalog;
  }

  // Preview and committed discovery must allocate exactly the same public names.
  planNames(
    project: string,
    sources: ProjectSource[],
    legacy?: ReservedCatalog,
    replacement?: {
      id: string;
      catalog: SourceCatalog;
      adapter?: SourceAdapter;
    }
  ) {
    return publishCatalogs(
      sources
        .filter(
          (s) =>
            s.enabled &&
            (s.id === replacement?.id ||
              (this.project === project &&
                this.adapters.get(s.id)?.health().status === 'ready'))
        )
        .map((s) => ({
          id: s.id,
          rules: s.kind === 'native' ? undefined : s.exposure,
          identity: (kind, route) =>
            (s.id === replacement?.id
              ? replacement.adapter
              : this.adapters.get(s.id)
            )?.originalIdentity?.(kind, route) ?? route,
          flexible:
            s.kind !== 'native' &&
            (s.naming ?? (s.kind === 'bridge' ? 'collisions' : 'always')) ===
              'collisions',
          catalog: this.visibleCatalog(
            s,
            s.id === replacement?.id ? replacement.catalog : undefined
          )
        })),
      legacy
    );
  }

  private async stop() {
    ++this.generation;
    this.status = 'stopped';
    this.bridgeFailures.clear();
    this.catalogs.clear();
    this.published.clear();
    await discardConnectionDrafts();
    const entries = [...this.adapters.entries()];
    const results = await Promise.allSettled(
      entries.map(([, adapter]) => adapter.close())
    );
    results.forEach((result, index) => {
      if (result.status === 'fulfilled')
        this.adapters.delete(entries[index][0]);
    });
    // Retain failed owners for cleanup retry; never silently lose a running process.
    if (this.adapters.size) {
      this.status = 'failed';
      this.error = 'Source cleanup failed; retry closing the project.';
      throw new Error(this.error);
    }
  }

  // Changing a binding's visibility only changes discovery. Keep running workers
  // when their definitions still match the project and the edited pack is current.
  private async canRepublish(
    project: string,
    sources: ProjectSource[],
    id: string
  ) {
    if (project !== this.project || this.status !== 'ready') return false;
    const next = sources.find((s) => s.id === id);
    if (!next || !next.enabled) return false;
    const expected = this.definitions.map((s) => {
      if (s.id !== id) return s;
      if (s.kind === 'native' && next.kind === 'native')
        return { ...s, disabledCapabilities: next.disabledCapabilities };
      if (s.kind !== 'native' && next.kind !== 'native') {
        const { exposure: _previous, ...settings } = s;
        return next.exposure
          ? { ...settings, exposure: next.exposure }
          : settings;
      }
      return s;
    });
    if (!isDeepStrictEqual(expected, sources)) return false;
    const adapter = this.adapters.get(id);
    if (!adapter || adapter.health().status !== 'ready') return false;
    return !(await adapter.filesChanged?.().catch(() => true));
  }

  private async startSource(
    root: string,
    source: ProjectSource,
    staged?: SourceAdapter,
    createdNative?: string
  ) {
    const adapter = staged ?? this.factory(root, source);
    this.adapters.set(source.id, adapter);
    try {
      if (!staged) await adapter.start();
      // Sync a newly scaffolded native pack if its files changed during startup.
      if (
        source.kind === 'native' &&
        source.id === createdNative &&
        (await adapter.filesChanged?.())
      ) {
        await adapter.close();
        await adapter.start();
      }
      this.catalogs.set(source.id, await adapter.discover());
    } catch (error) {
      if (source.kind === 'native') throw error;
      if (source.kind === 'bridge' && adapter.diagnostics)
        this.bridgeFailures.set(source.id, adapter.diagnostics());
      await adapter.close();
      this.adapters.delete(source.id);
      this.sourceFailures.set(
        source.id,
        error instanceof Error ? error.message : 'Connection failed.'
      );
    }
  }

  // A successfully previewed connection transfers ownership to this manager.
  open(
    project: string,
    root: string,
    input: ProjectSource[],
    options: {
      prepared?: { id: string; adapter: SourceAdapter };
      createdNative?: string;
      visibilityOnly?: string;
      legacy?: ReservedCatalog;
    } = {}
  ) {
    const { prepared } = options;
    return this.exclusive(async () => {
      let sources: ProjectSource[];
      try {
        sources = ProjectSourcesSchema.parse(input);
        if (
          options.visibilityOnly &&
          !prepared &&
          (await this.canRepublish(project, sources, options.visibilityOnly))
        ) {
          this.published = this.planNames(project, sources, options.legacy);
          this.definitions = sources;
          ++this.generation;
          await discardConnectionDrafts();
          return this.snapshot();
        }
        await this.stop();
      } catch (error) {
        await prepared?.adapter.close();
        throw error;
      }
      if (prepared) this.adapters.set(prepared.id, prepared.adapter);
      this.sourceFailures.clear();
      this.project = project;
      this.definitions = sources;
      this.error = undefined;
      this.status = 'starting';
      this.failedSource = undefined;
      let failedId: string | undefined;
      try {
        const enabled = sources.filter((source) => source.enabled);
        // Keep process launches bounded. Settle the entire batch before rolling
        // back so a slow adapter cannot start after its owner has closed it.
        const batchSize = 3;
        for (let i = 0; i < enabled.length; i += batchSize) {
          const batch = enabled.slice(i, i + batchSize);
          const outcomes = await Promise.allSettled(
            batch.map((source) =>
              this.startSource(
                root,
                source,
                source.id === prepared?.id ? prepared.adapter : undefined,
                options.createdNative
              )
            )
          );
          for (const [index, outcome] of outcomes.entries()) {
            if (outcome.status === 'rejected') {
              failedId = batch[index].id;
              throw outcome.reason;
            }
          }
        }
        this.published = this.planNames(project, sources, options.legacy);
        this.status = 'ready';
      } catch (error) {
        if (failedId) {
          this.failedSource = {
            id: failedId,
            diagnostics: this.adapters.get(failedId)?.diagnostics?.() ?? ''
          };
        }
        const message = error instanceof Error ? error.message : String(error);
        this.error = failedId ? `Source ${failedId}: ${message}` : message;
        await this.stop();
        this.status = 'failed';
      }
      return this.snapshot();
    });
  }

  close() {
    return this.exclusive(async () => {
      await this.stop();
      this.project = undefined;
      this.failedSource = undefined;
      this.definitions = [];
      this.sourceFailures.clear();
      this.error = undefined;
    });
  }

  async invoke(
    project: string,
    generation: number,
    source: string,
    call: SourceCall,
    inspectOriginal = false
  ) {
    const assertCurrent = () => {
      if (
        this.project !== project ||
        this.generation !== generation ||
        this.status !== 'ready'
      ) {
        throw new Error(
          'Project sources changed or are not ready. Refresh before invoking.'
        );
      }
    };
    assertCurrent();
    const adapter = this.adapters.get(source);
    if (!adapter || adapter.health().status !== 'ready')
      throw new Error('Source is not ready.');
    const publication = this.published.get(source);
    if (!publication) throw new Error('Source catalog is unavailable.');
    const kind =
      call.kind === 'tool'
        ? 'tools'
        : call.kind === 'resource'
          ? 'resources'
          : 'prompts';
    const items = inspectOriginal
      ? this.catalogs.get(source)?.[kind]
      : publication.catalog[kind];
    const item = items?.find((item) => {
      const key = 'uri' in item ? item.uri : item.name;
      return (
        (inspectOriginal
          ? (adapter.originalIdentity?.(kind, key) ?? key)
          : key) === call.name
      );
    });
    if (!item)
      throw new Error('Capability is disabled or not exposed by this source.');
    const name =
      'uri' in item
        ? item.uri
        : inspectOriginal || kind === 'resources'
          ? item.name
          : (publication[kind].get(item.name) ?? item.name);
    const origin = call.origin;
    const execution =
      call.kind === 'tool' && origin
        ? tryLogExecution(() =>
            startToolExecution(
              call.name,
              this.definitions.find((d) => d.id === source)!.kind,
              call.arguments,
              undefined,
              { projectId: project, sourceId: source, origin }
            )
          )
        : undefined;
    try {
      const result = await adapter.invoke({ ...call, name });
      assertCurrent();
      if (execution)
        tryLogExecution(() => completeToolExecution(execution, result));
      return result;
    } catch (error) {
      if (execution) tryLogExecution(() => failToolExecution(execution, error));
      throw error;
    }
  }
}

const state = globalThis as typeof globalThis & {
  forgeProjectSources?: ProjectSourceManager;
};
export const projectSources = (state.forgeProjectSources ??=
  new ProjectSourceManager());
