import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  Client,
  ProtocolError,
  SdkError,
  SdkErrorCode,
  SdkHttpError,
  StreamableHTTPClientTransport
} from '@modelcontextprotocol/client';
import type { SourceAdapter, SourceCall, SourceCatalog } from './contracts';
import type { ProjectSource } from './schema';

type ExternalSource = Extract<ProjectSource, { kind: 'external' }>;
const REQUEST_TIMEOUT = 20_000;
const MAX_PAGES = 100;
const MAX_ITEMS = 2_000;

// Only locally composed diagnostics may cross the management API. SDK errors
// can include upstream response bodies and credentials.
class DiscoveryError extends Error {}

function discoveryFailure(operation: string, failure: unknown) {
  if (failure instanceof SdkHttpError && Number.isInteger(failure.status))
    return new DiscoveryError(`${operation} failed (HTTP ${failure.status}).`);
  if (failure instanceof ProtocolError && Number.isSafeInteger(failure.code))
    return new DiscoveryError(
      `${operation} failed (MCP error ${failure.code}).`
    );
  if (failure instanceof SdkError) {
    if (failure.code === SdkErrorCode.RequestTimeout)
      return new DiscoveryError(`${operation} timed out.`);
    if (failure.code === SdkErrorCode.InvalidResult)
      return new DiscoveryError(
        `${operation} returned an invalid MCP response.`
      );
  }
  return new DiscoveryError(
    `${operation} failed. Check the server connection and Streamable HTTP endpoint.`
  );
}

function distinctResources(resources: SourceCatalog['resources']) {
  const byUri = new Map<string, SourceCatalog['resources'][number]>();
  for (const resource of resources) {
    const existing = byUri.get(resource.uri);
    if (!existing) byUri.set(resource.uri, resource);
    else if (!isDeepStrictEqual(existing, resource))
      throw new DiscoveryError(
        'resources/list returned conflicting definitions for the same resource URI.'
      );
  }
  return [...byUri.values()];
}

export function externalName(source: string, name: string) {
  const full = `${source}__${name}`;
  if (full.length <= 64 && /^[A-Za-z0-9_.-]+$/.test(full)) return full;
  const hash = createHash('sha256').update(full).digest('hex').slice(0, 12);
  return `${source.slice(0, 16)}__${name.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 30)}_${hash}`;
}
export function externalUri(source: string, uri: string) {
  return `forge-external://source/${encodeURIComponent(source)}/${encodeURIComponent(uri)}`;
}

/** An explicitly trusted upstream. Credentials never come from downstream requests. */
export class ExternalSourceAdapter implements SourceAdapter {
  private client?: Client;
  private transport?: StreamableHTTPClientTransport;
  private status: 'starting' | 'ready' | 'failed' | 'stopped' = 'stopped';
  private catalog: SourceCatalog = { tools: [], resources: [], prompts: [] };
  private routes = {
    tool: new Map<string, string>(),
    resource: new Map<string, string>(),
    prompt: new Map<string, string>()
  };
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
      const capabilities = client.getServerCapabilities();
      const options = { timeout: REQUEST_TIMEOUT };
      const [tools, resources, prompts] = await Promise.all([
        capabilities?.tools
          ? this.collect(
              (cursor) =>
                client.request(
                  { method: 'tools/list', params: cursor ? { cursor } : {} },
                  options
                ),
              'tools'
            )
          : [],
        capabilities?.resources
          ? this.collect(
              (cursor) =>
                client.request(
                  {
                    method: 'resources/list',
                    params: cursor ? { cursor } : {}
                  },
                  options
                ),
              'resources'
            )
          : [],
        capabilities?.prompts
          ? this.collect(
              (cursor) =>
                client.request(
                  { method: 'prompts/list', params: cursor ? { cursor } : {} },
                  options
                ),
              'prompts'
            )
          : []
      ]);
      this.routes = { tool: new Map(), resource: new Map(), prompt: new Map() };
      const bind = (
        kind: keyof typeof this.routes,
        publicName: string,
        original: string
      ) => {
        if (this.routes[kind].has(publicName))
          throw new DiscoveryError(
            `The server returned a duplicate ${kind} routing identity.`
          );
        this.routes[kind].set(publicName, original);
        return publicName;
      };
      // Collision-only names are resolved against the complete project after discovery.
      const nameFor = (name: string) =>
        this.source.naming === 'collisions'
          ? name
          : externalName(this.source.id, name);
      this.catalog = {
        tools: tools.map((item) => ({
          ...item,
          name: bind('tool', nameFor(item.name), item.name)
        })),
        resources: distinctResources(resources).map((item) => ({
          ...item,
          name: nameFor(item.name),
          uri: bind('resource', externalUri(this.source.id, item.uri), item.uri)
        })),
        prompts: prompts.map((item) => ({
          ...item,
          name: bind('prompt', nameFor(item.name), item.name)
        }))
      };
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
      throw discoveryFailure('MCP initialization', failure);
    } finally {
      clearTimeout(discoveryDeadline);
      signal?.removeEventListener('abort', abort);
    }
  }

  private async collect<K extends keyof SourceCatalog>(
    list: (
      cursor?: string
    ) => Promise<{ nextCursor?: string } & Record<K, SourceCatalog[K]>>,
    key: K
  ): Promise<SourceCatalog[K]> {
    const items: unknown[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await list(cursor).catch((failure: unknown) => {
        throw discoveryFailure(`${key}/list`, failure);
      });
      items.push(...result[key]);
      if (items.length > MAX_ITEMS)
        throw new DiscoveryError(
          `${key}/list exceeded the ${MAX_ITEMS}-item discovery limit.`
        );
      cursor = result.nextCursor;
      if (!cursor) return items as SourceCatalog[K];
      if (cursors.has(cursor))
        throw new DiscoveryError(`${key}/list repeated its pagination cursor.`);
      cursors.add(cursor);
    }
    throw new DiscoveryError(
      `${key}/list exceeded the ${MAX_PAGES}-page discovery limit.`
    );
  }

  async discover() {
    return structuredClone(this.catalog);
  }
  health() {
    return { status: this.status };
  }

  async invoke(call: SourceCall) {
    if (this.status !== 'ready' || !this.client)
      throw new Error('External source is not ready.');
    const name = this.routes[call.kind].get(call.name);
    if (!name) throw new Error('External capability not found.');
    const options = { signal: call.signal, timeout: REQUEST_TIMEOUT };
    try {
      if (call.kind === 'tool') {
        const result = await this.client.request(
          { method: 'tools/call', params: { name, arguments: call.arguments } },
          options
        );
        return {
          ...result,
          ...(Array.isArray(result.content)
            ? { content: result.content.map((item) => this.remapContent(item)) }
            : {})
        };
      }
      if (call.kind === 'resource') {
        const result = await this.client.request(
          { method: 'resources/read', params: { uri: name } },
          options
        );
        return {
          ...result,
          contents: result.contents.map((item) => ({
            ...item,
            uri: externalUri(this.source.id, item.uri)
          }))
        };
      }
      const args: Record<string, string> = {};
      for (const [key, value] of Object.entries(call.arguments)) {
        if (typeof value !== 'string')
          throw new Error('Prompt values must be strings.');
        Object.defineProperty(args, key, { value, enumerable: true });
      }
      const result = await this.client.request(
        { method: 'prompts/get', params: { name, arguments: args } },
        options
      );
      return {
        ...result,
        messages: result.messages.map((message) => ({
          ...message,
          content: this.remapContent(message.content)
        }))
      };
    } catch {
      throw new Error(
        `External ${call.kind} request failed, was cancelled or timed out. Forge did not retry it; verify the outcome upstream before retrying a write.`
      );
    }
  }

  private remapContent(content: unknown): unknown {
    if (!content || typeof content !== 'object') return content;
    const block = content as Record<string, unknown>;
    const remap = (uri: unknown) =>
      typeof uri === 'string' &&
      [...this.routes.resource.values()].includes(uri)
        ? externalUri(this.source.id, uri)
        : uri;
    if (block.type === 'resource_link')
      return { ...block, uri: remap(block.uri) };
    if (
      block.type === 'resource' &&
      block.resource &&
      typeof block.resource === 'object'
    ) {
      const resource = block.resource as Record<string, unknown>;
      return { ...block, resource: { ...resource, uri: remap(resource.uri) } };
    }
    return content;
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
    this.catalog = { tools: [], resources: [], prompts: [] };
  }
}
