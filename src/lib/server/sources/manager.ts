import type {
  SourceAdapter,
  SourceCall,
  SourceCatalog,
  SourceFactory
} from './contracts';
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
  private error?: string;

  constructor(private factory: SourceFactory = nativeFactory) {}

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
      sources: this.definitions.map((definition) => ({
        ...definition,
        ...(this.adapters.get(definition.id)?.health() ?? {
          status: !definition.enabled
            ? 'disabled'
            : this.error
              ? 'failed'
              : 'stopped'
        }),
        catalog: this.visibleCatalog(definition)
      }))
    };
  }

  private visibleCatalog(definition: ProjectSource): SourceCatalog {
    const catalog = structuredClone(
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

  private async stop() {
    ++this.generation;
    this.status = 'stopped';
    this.catalogs.clear();
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

  open(project: string, root: string, input: ProjectSource[]) {
    return this.exclusive(async () => {
      const sources = ProjectSourcesSchema.parse(input);
      await this.stop();
      this.project = project;
      this.definitions = sources;
      this.error = undefined;
      this.status = 'starting';
      try {
        for (const source of sources.filter((source) => source.enabled)) {
          const adapter = this.factory(root, source);
          this.adapters.set(source.id, adapter);
          await adapter.start();
          this.catalogs.set(source.id, await adapter.discover());
        }
        this.status = 'ready';
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
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
      this.definitions = [];
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
    const definition = this.definitions.find((item) => item.id === source)!;
    const catalog = this.visibleCatalog(definition);
    const exposed =
      call.kind === 'tool'
        ? catalog.tools.some((item) => item.name === call.name)
        : call.kind === 'resource'
          ? catalog.resources.some((item) => item.uri === call.name)
          : catalog.prompts.some((item) => item.name === call.name);
    if (!exposed)
      throw new Error('Capability is disabled or not exposed by this source.');
    const result = await adapter.invoke(call);
    assertCurrent();
    return result;
  }
}

const state = globalThis as typeof globalThis & {
  forgeProjectSources?: ProjectSourceManager;
};
export const projectSources = (state.forgeProjectSources ??=
  new ProjectSourceManager());
