import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';
import { NativeNodeTransport } from '../mcpack/node-transport';
import { resolveNodeCommand } from '../execution/node-command';
import { resolvePythonCommand } from '../execution/python-command';
import { applicationRoot, sourcePath } from '../filesystem/source-paths';
import { diagnosticExcerpt } from '../mcpack/diagnostic-text';
import type { SourceAdapter, SourceCall, SourceCatalog } from './contracts';
import type { ProjectSource } from './schema';
import { DiscoveryError, REQUEST_TIMEOUT, UpstreamCatalog } from './upstream';

type BridgeSource = Extract<ProjectSource, { kind: 'bridge' }>;

export class BridgeStartupError extends Error {
  constructor(
    message: string,
    readonly details: string
  ) {
    super(message);
  }
}

function interpreter(runtime: BridgeSource['runtime'], cwd: string) {
  if (runtime === 'node') return resolveNodeCommand();
  const venv = join(cwd, '.venv');
  if (!existsSync(venv)) return resolvePythonCommand();
  const executable =
    process.platform === 'win32'
      ? join(venv, 'Scripts', 'python.exe')
      : join(venv, 'bin', 'python');
  if (!existsSync(executable))
    throw new Error(
      'The bridge working directory contains an incomplete .venv. Recreate it and install the project dependencies.'
    );
  return { executable, prefixArgs: [] };
}

/** Runs one trusted project-owned MCP server directly, without a shell. */
export class BridgeSourceAdapter implements SourceAdapter {
  private client?: Client;
  private transport?: NativeNodeTransport;
  private catalog?: UpstreamCatalog;
  private status: ReturnType<SourceAdapter['health']>['status'] = 'stopped';
  private stderr = '';
  private stage = 'Check paths';
  private effectiveCwd = '';
  private executable = '';
  private exitStatus?: string | number;
  private failureDetails = '';
  constructor(
    private root: string,
    private source: BridgeSource
  ) {}
  async start(signal?: AbortSignal) {
    signal?.throwIfAborted();
    this.status = 'starting';
    this.stage = 'Check paths';
    this.stderr = this.failureDetails = '';
    this.exitStatus = undefined;
    this.executable = '';
    this.effectiveCwd = '';
    try {
      await this.connect(signal);
    } catch (error) {
      signal?.throwIfAborted();
      this.status = 'failed';
      const message =
        error instanceof Error ? error.message : 'Bridge startup failed.';
      const stderr = diagnosticExcerpt(this.stderr, [
        ...(this.source.inheritEnv ?? []).map((key) => process.env[key] ?? ''),
        ...(this.source.args ?? [])
      ]);
      this.failureDetails = [
        `Stage: ${this.stage}`,
        `Runtime: ${this.source.runtime}`,
        this.executable && `Executable: ${this.executable}`,
        `Entrypoint: ${this.source.entrypoint}`,
        `Working directory: ${this.effectiveCwd || '(unresolved)'}`,
        this.exitStatus !== undefined && `Process exit: ${this.exitStatus}`,
        stderr && `Standard error:\n${stderr}`
      ]
        .filter(Boolean)
        .join('\n');
      throw new BridgeStartupError(message, this.failureDetails);
    }
  }

  diagnostics() {
    return this.failureDetails;
  }

  private async connect(signal?: AbortSignal) {
    const { entrypoint, runtime, inheritEnv = [], args = [] } = this.source;
    const hooks = this.source.mode === 'adapter';
    const application = applicationRoot(this.root, this.source.checkoutEnv);
    this.effectiveCwd = this.source.cwd
      ? resolve(application, this.source.cwd.replaceAll('\\', '/'))
      : hooks
        ? application
        : dirname(resolve(this.root, entrypoint.replaceAll('\\', '/')));
    const entry = sourcePath(
      this.root,
      entrypoint,
      hooks ? 'Adapter file' : 'Stdio entrypoint'
    );
    const cwd = this.source.cwd
      ? sourcePath(application, this.source.cwd, 'Working directory', true)
      : hooks
        ? application
        : dirname(entry);
    this.effectiveCwd = cwd;
    this.stage = 'Launch runtime';
    // A dedicated adapter venv can contain both the runner and application dependencies.
    const adapterFolder = dirname(entry);
    const command = interpreter(
      runtime,
      hooks && existsSync(join(adapterFolder, '.venv')) ? adapterFolder : cwd
    );
    this.executable = command.executable;
    const launchArgs = [...command.prefixArgs];
    if (hooks) {
      if (runtime === 'python') launchArgs.push('-B');
      const host = runtime === 'node' ? 'node.mjs' : 'python.py';
      launchArgs.push(
        createRequire(import.meta.url).resolve(`#forge-bridges/${host}`),
        application
      );
    }
    const env = getDefaultEnvironment();
    for (const key of inheritEnv) {
      const value = process.env[key];
      if (value === undefined)
        throw new Error(
          `Set bridge environment variable ${key} before starting Forge.`
        );
      env[key] = value;
    }
    this.stderr = '';
    const transport = (this.transport = new NativeNodeTransport({
      command: command.executable,
      args: [...launchArgs, entry, ...args],
      cwd,
      env,
      shutdownMs: 3000,
      diagnostic: (chunk) => {
        this.stderr = (this.stderr + chunk).slice(-16384);
      }
    }));
    const client = (this.client = new Client({
      name: 'modern-mcp-forge-bridge',
      version: '0.10.0'
    }));
    client.onclose = () => {
      if (this.status !== 'stopped') this.status = 'failed';
    };
    const deadline = AbortSignal.timeout(30000);
    const startup = signal ? AbortSignal.any([deadline, signal]) : deadline;
    // SDK version negotiation can be waiting for its first stdio reply before
    // normal request cancellation is installed. Closing the pipe releases that probe.
    const interrupt = () => {
      void transport.close();
    };
    startup.addEventListener('abort', interrupt, { once: true });
    try {
      startup.throwIfAborted();
      await client.connect(transport, {
        signal: startup,
        timeout: REQUEST_TIMEOUT
      });
      this.stage = 'Discover catalog';
      const catalog = new UpstreamCatalog(
        client,
        this.source.id,
        this.source.naming ?? 'collisions',
        'bridge'
      );
      await catalog.load(startup);
      startup.throwIfAborted();
      this.catalog = catalog;
      this.status = 'ready';
    } catch (failure) {
      if (this.stage === 'Launch runtime' && transport.spawned)
        this.stage = 'Initialize MCP';
      await this.close();
      this.exitStatus = transport.exitStatus;
      this.status = 'failed';
      signal?.throwIfAborted();
      if (deadline.aborted)
        throw new Error(
          'Bridge discovery timed out. Check that the entrypoint serves MCP over stdio.'
        );
      if (hooks && this.stderr.includes('FORGE_BRIDGE_INVALID_HOOKS'))
        throw new Error(
          'The adapter must export at least one complete pair of discovery and invocation hooks. Check the bridge guide.'
        );
      if (
        hooks &&
        runtime === 'python' &&
        /No module named ['"]mcp['"]/.test(this.stderr)
      )
        throw new Error(
          'Install requirements-forge.txt in the Python environment used by this adapter.'
        );
      if (
        /ModuleNotFoundError|ERR_MODULE_NOT_FOUND|Cannot find module|ImportError/.test(
          this.stderr
        )
      )
        throw new Error(
          'Bridge startup failed to import a module. Check the working directory, installed dependencies and build output.'
        );
      if (failure instanceof DiscoveryError) throw failure;
      throw new Error(
        'Bridge initialization or discovery failed. Check the startup details and working directory.'
      );
    } finally {
      startup.removeEventListener('abort', interrupt);
    }
  }
  originalIdentity(kind: keyof SourceCatalog, route: string) {
    return this.catalog?.originalIdentity(kind, route) ?? route;
  }
  async discover() {
    if (!this.catalog || this.status !== 'ready')
      throw new Error('Bridge is not ready.');
    return this.catalog.snapshot();
  }
  health() {
    return {
      status: this.status,
      error:
        this.status === 'failed'
          ? 'Bridge stopped. Check the entrypoint and reload sources.'
          : undefined
    };
  }
  async invoke(call: SourceCall) {
    if (!this.catalog || this.status !== 'ready')
      throw new Error('Bridge is not ready.');
    return this.catalog.invoke(call);
  }
  async close() {
    this.status = 'stopped';
    try {
      await this.client?.close();
    } finally {
      await this.transport?.close();
    }
    this.client = undefined;
    this.transport = undefined;
    this.catalog = undefined;
  }
}
