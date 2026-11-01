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
import { discardExternalDrafts } from './external-drafts';
import { ExternalSourceAdapter } from './external';
import { NativeSourceAdapter } from './native';
import { ProjectSourcesSchema, type ProjectSource } from './schema';

const nativeFactory: SourceFactory = (root, source) => {
  if (source.kind === 'external') return new ExternalSourceAdapter(source);
  if (source.kind !== 'native')
    throw new Error(`${source.kind} sources are not implemented.`);
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
  private externalFailures = new Map<string, string>();
  private failedSource?: { id: string; diagnostics: string };

  // Local authoring only. Worker output must never enter the public MCP catalog.
  diagnostics(project: string, source: string) {
    if (this.project !== project) return '';
    if (this.failedSource?.id === source) return this.failedSource.diagnostics;
    return this.adapters.get(source)?.diagnostics?.() ?? '';
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

  snapshot() {
    return {
      project: this.project ?? null,
      generation: this.generation,
      status: this.status,
      error: this.error,
      sources: this.definitions.map((definition) => {
        const health = this.adapters.get(definition.id)?.health();
        const externalError = this.externalFailures.get(definition.id);
        const status =
          health?.status ??
          (!definition.enabled
            ? 'disabled'
            : externalError || this.failedSource?.id === definition.id
              ? 'failed'
              : 'stopped');
        return {
          ...definition,
          status,
          error:
            externalError ??
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
    replacement?: { id: string; catalog: SourceCatalog }
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
          flexible: s.kind === 'external' && s.naming === 'collisions',
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
    this.catalogs.clear();
    this.published.clear();
    await discardExternalDrafts();
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

  // A successfully previewed connection transfers ownership to this manager.
  open(
    project: string,
    root: string,
    input: ProjectSource[],
    options: {
      prepared?: { id: string; adapter: SourceAdapter };
      createdNative?: string;
      legacy?: ReservedCatalog;
    } = {}
  ) {
    const { prepared } = options;
    return this.exclusive(async () => {
      let sources: ProjectSource[];
      try {
        sources = ProjectSourcesSchema.parse(input);
        await this.stop();
      } catch (error) {
        await prepared?.adapter.close();
        throw error;
      }
      if (prepared) this.adapters.set(prepared.id, prepared.adapter);
      this.externalFailures.clear();
      this.project = project;
      this.definitions = sources;
      this.error = undefined;
      this.status = 'starting';
      this.failedSource = undefined;
      let startingId = '';
      try {
        for (const source of sources.filter((source) => source.enabled)) {
          startingId = source.id;
          const staged =
            source.id === prepared?.id ? prepared.adapter : undefined;
          const adapter = staged ?? this.factory(root, source);
          this.adapters.set(source.id, adapter);
          try {
            if (!staged) await adapter.start();
            // Confirm the freshly scaffolded files were the ones the worker loaded.
            // If they changed during startup, sync once before opening the editor.
            if (
              source.kind === 'native' &&
              source.id === options.createdNative &&
              (await adapter.filesChanged?.())
            ) {
              await adapter.close();
              await adapter.start();
            }
            this.catalogs.set(source.id, await adapter.discover());
          } catch (error) {
            if (source.kind !== 'external') throw error;
            await adapter.close();
            this.adapters.delete(source.id);
            this.externalFailures.set(
              source.id,
              error instanceof Error ? error.message : 'Connection failed.'
            );
          }
        }
        this.published = this.planNames(project, sources, options.legacy);
        this.status = 'ready';
      } catch (error) {
        this.failedSource = {
          id: startingId,
          diagnostics: this.adapters.get(startingId)?.diagnostics?.() ?? ''
        };
        const message = error instanceof Error ? error.message : String(error);
        this.error = `Source ${startingId}: ${message}`;
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
      this.externalFailures.clear();
      this.error = undefined;
    });
  }

  async invoke(
    project: string,
    generation: number,
    source: string,
    call: SourceCall
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
    const { catalog } = publication;
    const exposed =
      call.kind === 'tool'
        ? catalog.tools.some((item) => item.name === call.name)
        : call.kind === 'resource'
          ? catalog.resources.some((item) => item.uri === call.name)
          : catalog.prompts.some((item) => item.name === call.name);
    if (!exposed)
      throw new Error('Capability is disabled or not exposed by this source.');
    const name =
      call.kind === 'resource'
        ? call.name
        : (publication[call.kind === 'tool' ? 'tools' : 'prompts'].get(
            call.name
          ) ?? call.name);
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
