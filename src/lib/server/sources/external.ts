import {
  Client,
  StreamableHTTPClientTransport
} from '@modelcontextprotocol/client';
import type { SourceAdapter, SourceCall } from './contracts';
import type { ProjectSource } from './schema';
import {
  DiscoveryError,
  discoveryFailure,
  REQUEST_TIMEOUT,
  UpstreamCatalog
} from './upstream';
export {
  qualifiedName as externalName,
  publishedUri as externalUri
} from './upstream';
type ExternalSource = Extract<ProjectSource, { kind: 'external' }>;
/** An explicitly trusted upstream. Credentials never come from downstream requests. */
export class ExternalSourceAdapter implements SourceAdapter {
  private client?: Client;
  private transport?: StreamableHTTPClientTransport;
  private status: 'starting' | 'ready' | 'failed' | 'stopped' = 'stopped';
  private catalog?: UpstreamCatalog;
  private lifetime = new AbortController();

  constructor(private source: ExternalSource) {}

  async start(signal?: AbortSignal) {
    signal?.throwIfAborted();
    this.status = 'starting';
    this.lifetime = new AbortController();
    const url = new URL(this.source.url);
    const token = this.source.bearerTokenEnv
      ? process.env[this.source.bearerTokenEnv]
      : undefined;
    if (this.source.bearerTokenEnv && !token)
      throw new Error(
        `Set environment variable ${this.source.bearerTokenEnv} before connecting.`
      );
    if (
      token &&
      url.protocol !== 'https:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
      throw new Error(
        'Bearer authentication requires HTTPS, except for loopback development servers.'
      );
    const client = new Client({
      name: 'modern-mcp-forge-external',
      version: '0.10.0'
    });
    this.client = client;
    let authStatus: number | undefined;
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: token
        ? { headers: { Authorization: `Bearer ${token}` } }
        : undefined,
      fetch: async (input, init) => {
        // Never follow redirects or send this credential to auth/metadata endpoints.
        const target = new URL(input);
        if (target.href !== url.href)
          throw new Error('Upstream requested a different endpoint.');
        const headerDeadline = new AbortController();
        const timer = setTimeout(
          () => headerDeadline.abort(),
          init?.method === 'DELETE' ? 5_000 : REQUEST_TIMEOUT
        );
        const signals = [this.lifetime.signal, headerDeadline.signal];
        if (init?.signal) signals.push(init.signal);
        try {
          const response = await fetch(input, {
            ...init,
            redirect: 'error',
            signal: AbortSignal.any(signals)
          });
          if (response.status === 401 || response.status === 403)
            authStatus = response.status;
          if (!response.body) return response;
          let bytes = 0;
          const bounded = response.body.pipeThrough(
            new TransformStream<Uint8Array, Uint8Array>({
              transform(chunk, controller) {
                bytes += chunk.byteLength;
                if (bytes > 8 * 1024 * 1024)
                  throw new Error('External response exceeds 8 MiB.');
                controller.enqueue(chunk);
              }
            })
          );
          return new Response(bounded, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
        } finally {
          clearTimeout(timer);
        }
      }
    });
    this.transport = transport;
    client.onclose = () => {
      if (this.status !== 'stopped') this.status = 'failed';
    };
    const abort = () => this.lifetime.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const discoveryDeadline = setTimeout(() => this.lifetime.abort(), 30_000);
    try {
      await client.connect(transport, { timeout: REQUEST_TIMEOUT });
      this.catalog = new UpstreamCatalog(
        client,
        this.source.id,
        this.source.naming ?? 'always',
        'external'
      );
      await this.catalog.load(this.lifetime.signal);
      this.status = 'ready';
    } catch (failure) {
      this.status = 'failed';
      signal?.throwIfAborted();
      if (authStatus === 401)
        throw new Error(
          token
            ? 'The server rejected the access token (HTTP 401). Check its audience and expiry, then restart Forge with a valid token.'
            : 'The server requires an access token (HTTP 401). Obtain one from its authorization server and choose Bearer token.'
        );
      if (authStatus === 403)
        throw new Error(
          'The server denied access (HTTP 403). Check the permissions granted to this connection.'
        );
      if (this.lifetime.signal.aborted)
        throw new DiscoveryError(
          'External discovery exceeded its 30-second deadline.'
        );
      if (failure instanceof DiscoveryError) throw failure;
      throw discoveryFailure('MCP initialization', failure, 'external');
    } finally {
      clearTimeout(discoveryDeadline);
      signal?.removeEventListener('abort', abort);
    }
  }

  async discover() {
    return (
      this.catalog?.snapshot() ?? { tools: [], resources: [], prompts: [] }
    );
  }
  health() {
    return { status: this.status };
  }
  async invoke(call: SourceCall) {
    if (this.status !== 'ready' || !this.catalog)
      throw new Error('External source is not ready.');
    return this.catalog.invoke(call);
  }

  async close() {
    this.status = 'stopped';
    try {
      await this.transport?.terminateSession();
    } catch {
      /* Remote cleanup is best effort; always release the local connection. */
    }
    this.lifetime.abort();
    await this.client?.close();
    this.client = undefined;
    this.transport = undefined;
    this.catalog = undefined;
  }
}
