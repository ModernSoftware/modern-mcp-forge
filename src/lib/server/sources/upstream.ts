import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  Client,
  ProtocolError,
  SdkError,
  SdkErrorCode,
  SdkHttpError
} from '@modelcontextprotocol/client';
import type { SourceCall, SourceCatalog } from './contracts';
export type UpstreamKind = 'external' | 'bridge';
export const REQUEST_TIMEOUT = 20_000;
const MAX_PAGES = 100;
const MAX_ITEMS = 2_000;

// Only locally composed diagnostics may cross the management API. SDK errors
// can include upstream response bodies and credentials.
export class DiscoveryError extends Error {}

export function discoveryFailure(
  operation: string,
  failure: unknown,
  kind: UpstreamKind
) {
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
    `${operation} failed. ${kind === 'external' ? 'Check the server connection and Streamable HTTP endpoint.' : 'Check the local stdio server.'}`
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

export function qualifiedName(source: string, name: string) {
  const full = `${source}__${name}`;
  if (full.length <= 64 && /^[A-Za-z0-9_.-]+$/.test(full)) return full;
  const hash = createHash('sha256').update(full).digest('hex').slice(0, 12);
  return `${source.slice(0, 16)}__${name.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 30)}_${hash}`;
}
export function publishedUri(
  source: string,
  uri: string,
  kind: UpstreamKind = 'external'
) {
  return `forge-${kind}://source/${encodeURIComponent(source)}/${encodeURIComponent(uri)}`;
}

export class UpstreamCatalog {
  private catalog: SourceCatalog = { tools: [], resources: [], prompts: [] };
  private routes = {
    tool: new Map<string, string>(),
    resource: new Map<string, string>(),
    prompt: new Map<string, string>()
  };
  constructor(
    private client: Client,
    private id: string,
    private naming: 'always' | 'collisions',
    private kind: UpstreamKind
  ) {}
  async load(signal: AbortSignal) {
    const capabilities = this.client.getServerCapabilities();
    const options = { timeout: REQUEST_TIMEOUT, signal };
    const [tools, resources, prompts] = await Promise.all([
      capabilities?.tools
        ? this.collect(
            (cursor) =>
              this.client.request(
                { method: 'tools/list', params: cursor ? { cursor } : {} },
                options
              ),
            'tools'
          )
        : [],
      capabilities?.resources
        ? this.collect(
            (cursor) =>
              this.client.request(
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
              this.client.request(
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
      this.naming === 'collisions' ? name : qualifiedName(this.id, name);
    this.catalog = {
      tools: tools.map((item) => ({
        ...item,
        name: bind('tool', nameFor(item.name), item.name)
      })),
      resources: distinctResources(resources).map((item) => ({
        ...item,
        name: nameFor(item.name),
        uri: bind(
          'resource',
          publishedUri(this.id, item.uri, this.kind),
          item.uri
        )
      })),
      prompts: prompts.map((item) => ({
        ...item,
        name: bind('prompt', nameFor(item.name), item.name)
      }))
    };
  }
  snapshot() {
    return structuredClone(this.catalog);
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
        throw discoveryFailure(`${key}/list`, failure, this.kind);
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

  async invoke(call: SourceCall) {
    const name = this.routes[call.kind].get(call.name);
    if (!name) throw new Error(`${this.kind} capability not found.`);
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
            uri: publishedUri(this.id, item.uri, this.kind)
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
        `${this.kind === 'external' ? 'External' : 'Bridge'} ${call.kind} request failed, was cancelled or timed out. Forge did not retry it; verify the outcome upstream before retrying a write.`
      );
    }
  }

  private remapContent(content: unknown): unknown {
    if (!content || typeof content !== 'object') return content;
    const block = content as Record<string, unknown>;
    const remap = (uri: unknown) =>
      typeof uri === 'string' &&
      [...this.routes.resource.values()].includes(uri)
        ? publishedUri(this.id, uri, this.kind)
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
}
