import { existsSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';
import { NativeNodeTransport } from '../mcpack/node-transport';
import { resolveNodeCommand } from '../execution/node-command';
import { resolvePythonCommand } from '../execution/python-command';
import { containedFile } from './authoring';
import type { SourceAdapter, SourceCall } from './contracts';
import type { ProjectSource } from './schema';
import { DiscoveryError, REQUEST_TIMEOUT, UpstreamCatalog } from './upstream';

type BridgeSource = Extract<ProjectSource, { kind: 'bridge' }>;

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
  constructor(
    private root: string,
    private source: BridgeSource
  ) {}
  async start(signal?: AbortSignal) {
    signal?.throwIfAborted();
    this.status = 'starting';
    const { entrypoint, runtime, inheritEnv = [], args = [] } = this.source;
    const entry = containedFile(this.root, entrypoint);
    const hooks = this.source.mode === 'adapter';
    let application = this.root;
    if (this.source.checkoutEnv) {
      if (!hooks)
        throw new Error(
          'A checkout variable is supported only for an adapter module.'
        );
      const checkout = process.env[this.source.checkoutEnv];
      if (
        !checkout ||
        !isAbsolute(checkout) ||
        !statSync(checkout, { throwIfNoEntry: false })?.isDirectory()
      )
        throw new Error(
          `Set ${this.source.checkoutEnv} to the absolute path of the application checkout before starting Forge.`
        );
      application = checkout;
    }
    const cwd = this.source.cwd
      ? containedFile(application, this.source.cwd)
      : hooks
        ? application
        : dirname(entry);
    if (!statSync(entry).isFile() || !statSync(cwd).isDirectory())
      throw new Error(
        'Choose an adapter or entrypoint file and a valid working directory.'
      );
    // A dedicated adapter venv can contain both the runner and application dependencies.
    const adapterFolder = dirname(entry);
    const command = interpreter(
      runtime,
      hooks && existsSync(join(adapterFolder, '.venv')) ? adapterFolder : cwd
    );
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
      await this.close();
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
          'Bridge startup failed to import a module. Install dependencies in the bridge working directory and check its imports.'
        );
      if (failure instanceof DiscoveryError) throw failure;
      throw new Error(
        'Bridge initialization or discovery failed. Run the entrypoint in its working directory and check that stdout contains only MCP messages.'
      );
    } finally {
      startup.removeEventListener('abort', interrupt);
    }
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
