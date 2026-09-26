import { installedMCPackCli } from './cli-path';
export { installedMCPackCli } from './cli-path';
import { Client } from '@modelcontextprotocol/client';
import { NativeNodeTransport } from './node-transport';
import { createHash } from 'node:crypto';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { resolveNodeCommand } from '$lib/server/execution/node-command';

const MAX_FILE_BYTES = 256 * 1024;
export class NativeProjectError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = 'NativeProjectError';
  }
  // The manager survives Vite reloads; its errors may come from an older module.
  static is(error: unknown): error is NativeProjectError {
    return (
      error instanceof Error &&
      error.name === 'NativeProjectError' &&
      'status' in error &&
      [400, 409, 503].includes(Number(error.status))
    );
  }
}
export type NativeKind = 'tool' | 'resource' | 'prompt';
export interface NativeCatalog {
  tools: Awaited<ReturnType<Client['listTools']>>['tools'];
  resources: Awaited<ReturnType<Client['listResources']>>['resources'];
  prompts: Awaited<ReturnType<Client['listPrompts']>>['prompts'];
}
interface NativeSession {
  manifestPath: string;
  name: string;
  generation: number;
  status: 'starting' | 'ready' | 'failed' | 'stopped';
  files: string[];
  catalog: NativeCatalog;
  client?: Client;
  diagnostics: string;
  error?: string;
}

const digest = (text: string) => createHash('sha256').update(text).digest('hex');

/** One native project per Forge process. Lifecycle mutations are serialized. */
export class NativeProjectManager {
  private session?: NativeSession;
  private mutation: Promise<unknown> = Promise.resolve();
  private generation = 0;

  constructor(private readonly cli: () => string = installedMCPackCli) {}

  snapshot() {
    const current = this.session;
    if (!current) return null;
    const { client: _client, ...snapshot } = current;
    return structuredClone(snapshot);
  }

  selected() {
    return Boolean(this.session);
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutation.then(operation);
    this.mutation = next.catch(() => {});
    return next;
  }

  async open(filename: string) {
    return this.exclusive(async () => {
      const manifestPath = await realpath(resolve(filename));
      // Parse before replacing the current project; MCPack owns full validation.
      const manifest = JSON.parse(await this.readLimited(manifestPath));
      if (manifest.schemaVersion !== 1 || !manifest.workers || typeof manifest.name !== 'string') {
        throw new NativeProjectError('Select a native MCPack v1 manifest.');
      }
      await this.stop();
      this.session = {
        manifestPath,
        name: manifest.name,
        generation: ++this.generation,
        status: 'starting',
        files: [manifestPath],
        catalog: { tools: [], resources: [], prompts: [] },
        diagnostics: ''
      };
      await this.start(this.session);
      return this.snapshot();
    });
  }

  restart(project: string) {
    return this.exclusive(async () => {
      const session = this.requireProject(project);
      await this.stop();
      session.generation = ++this.generation;
      await this.start(session);
      return this.snapshot();
    });
  }

  close() {
    return this.exclusive(async () => {
      await this.stop();
      this.session = undefined;
    });
  }

  private async stop() {
    const session = this.session;
    if (!session) return;
    session.status = 'stopped';
    const client = session.client;
    session.client = undefined;
    await client?.close();
  }

  private async start(session: NativeSession) {
    session.status = 'starting';
    session.error = undefined;
    session.catalog = { tools: [], resources: [], prompts: [] };
    const client = new Client({ name: 'modern-mcp-forge-native', version: '0.10.0' });
    try {
      const manifest = JSON.parse(await this.readLimited(session.manifestPath));
      session.files = [session.manifestPath];
      for (const worker of Object.values(manifest.workers ?? {}) as { module?: unknown }[]) {
        if (typeof worker.module !== 'string') continue;
        const filename = await this.withinRoot(session, worker.module);
        if (!session.files.includes(filename)) session.files.push(filename);
      }
      const cli = await realpath(this.cli()).catch(() => {
        throw new NativeProjectError(
          'MCPack is not installed. Run bun install --frozen-lockfile, or check FORGE_MCPACK_CLI if set.'
        );
      });
      const node = resolveNodeCommand();
      const transport = new NativeNodeTransport({
        command: node.executable,
        args: [...node.prefixArgs, cli, 'serve', session.manifestPath],
        cwd: dirname(session.manifestPath),
        shutdownMs:
          Math.min(
            30_000,
            Math.max(
              3_000,
              ...Object.values(manifest.workers ?? {}).map(
                (worker: any) => Number(worker.shutdownTimeoutMs) || 3_000
              )
            )
          ) + 2_000,
        diagnostic: (text) => {
          session.diagnostics = (session.diagnostics + text).slice(-16_384);
        },
        // MCPack applies the manifest's worker inheritEnv allowlist inside Node.
        env: Object.fromEntries(
          Object.entries(process.env).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string'
          )
        )
      });
      client.onclose = () => {
        if (session.status === 'ready') {
          session.status = 'failed';
          session.error = 'MCPack disconnected. Inspect diagnostics and restart.';
        }
      };
      session.client = client;
      const startupBudget = Math.min(
        300_000,
        Math.max(
          10_000,
          ...Object.values(manifest.workers ?? {}).map(
            (worker: any) => Number(worker?.startupTimeoutMs) || 10_000
          )
        )
      );
      // Allow MCPack to enforce its own startup and cleanup deadlines first.
      await client.connect(transport, { timeout: startupBudget + 35_000 });
      const [tools, resources, prompts] = await Promise.all([
        this.collect(client.listTools.bind(client), 'tools'),
        this.collect(client.listResources.bind(client), 'resources'),
        this.collect(client.listPrompts.bind(client), 'prompts')
      ]);
      session.catalog = { tools, resources, prompts } as NativeCatalog;
      session.name = manifest.name;
      session.status = 'ready';
    } catch (error) {
      session.status = 'failed';
      session.error = error instanceof Error ? error.message : String(error);
      await client.close().catch(() => {});
      session.client = undefined;
      // Keep the selected project editable after a failed startup.
    }
  }

  private async collect(list: (params?: { cursor?: string }) => Promise<any>, key: string) {
    const items: any[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const page = await list(cursor ? { cursor } : undefined);
      items.push(...page[key]);
      cursor = page.nextCursor;
      if (cursor && seen.has(cursor))
        throw new NativeProjectError('Discovery returned a repeated cursor.');
      if (cursor) seen.add(cursor);
    } while (cursor);
    return items;
  }

  private requireProject(project: string): NativeSession {
    if (!this.session || this.session.manifestPath !== project) {
      throw new NativeProjectError('The selected project changed. Reload this page.', 409);
    }
    return this.session;
  }

  /** Capture the generation so old MCP sessions cannot silently switch projects. */
  connection() {
    const session = this.session;
    if (!session || session.status !== 'ready' || !session.client) {
      throw new NativeProjectError(session?.error ?? 'Open a native MCPack project first.', 503);
    }
    const generation = session.generation;
    const client = session.client;
    return {
      name: session.name,
      catalog: session.catalog,
      assertReady: () => {
        if (
          this.session !== session ||
          session.generation !== generation ||
          session.status !== 'ready'
        ) {
          throw new NativeProjectError(
            'Native project restarted or closed. Reconnect the MCP client.',
            409
          );
        }
      },
      client
    };
  }

  async invoke(
    project: string,
    kind: NativeKind,
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal
  ) {
    this.requireProject(project);
    const connection = this.connection();
    connection.assertReady();
    const options = { signal, timeout: 300_000 };
    if (kind === 'tool') return connection.client.callTool({ name, arguments: args }, options);
    if (kind === 'resource') return connection.client.readResource({ uri: name }, options);
    if (Object.values(args).some((value) => typeof value !== 'string'))
      throw new NativeProjectError('Prompt arguments must be strings.');
    return connection.client.getPrompt(
      { name, arguments: args as Record<string, string> },
      options
    );
  }

  private async withinRoot(session: NativeSession, filename: string) {
    const root = dirname(session.manifestPath);
    const path = await realpath(resolve(root, filename));
    const rel = relative(root, path);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new NativeProjectError('Source files must remain inside the native project.');
    }
    return path;
  }

  private async editable(session: NativeSession, filename: string) {
    const path = await this.withinRoot(session, filename);
    if (!session.files.includes(path))
      throw new NativeProjectError('Only the manifest and declared worker modules can be edited.');
    return path;
  }

  private async readLimited(filename: string) {
    if ((await stat(filename)).size > MAX_FILE_BYTES)
      throw new NativeProjectError('File exceeds the 256 KiB editor limit.');
    return readFile(filename, 'utf8');
  }

  async readSource(project: string, filename: string) {
    const session = this.requireProject(project);
    const path = await this.editable(session, filename);
    const content = await this.readLimited(path);
    return { path, content, revision: digest(content) };
  }

  saveSource(project: string, filename: string, content: string, revision: string) {
    return this.exclusive(async () => {
      const session = this.requireProject(project);
      const path = await this.editable(session, filename);
      if (Buffer.byteLength(content) > MAX_FILE_BYTES)
        throw new NativeProjectError('File exceeds the 256 KiB editor limit.');
      if (digest(await this.readLimited(path)) !== revision)
        throw new NativeProjectError('File changed on disk. Reload before saving.', 409);
      if (path === session.manifestPath) JSON.parse(content);
      await this.stop();
      await writeFile(path, content, 'utf8');
      session.generation = ++this.generation;
      await this.start(session);
      return { source: await this.readSource(project, path), project: this.snapshot() };
    });
  }
}

// Retain one owner across Vite module reloads; child stdin closes on host exit.
const globalState = globalThis as typeof globalThis & { forgeNativeProject?: NativeProjectManager };
export const nativeProjects = (globalState.forgeNativeProject ??= new NativeProjectManager());
