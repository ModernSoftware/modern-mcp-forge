const LOOPBACK_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1'
]);

function normalizeHostname(hostname: string): string {
  const normalized = hostname.toLowerCase();

  if (normalized.startsWith('[') && normalized.endsWith(']')) {
    return normalized.slice(1, -1);
  }

  return normalized;
}

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(normalizeHostname(hostname));
}

function forbidden(message: string): Response {
  return new Response(
    JSON.stringify({
      error: 'forbidden',
      message
    }),
    {
      status: 403,
      headers: {
        'content-type': 'application/json'
      }
    }
  );
}

export function validateLocalRequest(request: Request): Response | null {
  const requestUrl = new URL(request.url);

  if (!isLoopbackHost(requestUrl.hostname)) {
    return forbidden(
      'Modern MCP Forge local-management endpoints accept traffic only on loopback.'
    );
  }

  const hostHeader = request.headers.get('host');

  if (hostHeader) {
    try {
      const hostUrl = new URL(`http://${hostHeader}`);

      if (!isLoopbackHost(hostUrl.hostname)) {
        return forbidden('The Host header is not a loopback address.');
      }
    } catch {
      return forbidden('The Host header is invalid.');
    }
  }

  const originHeader = request.headers.get('origin');

  if (originHeader) {
    try {
      const origin = new URL(originHeader);

      if (!isLoopbackHost(origin.hostname)) {
        return forbidden('The Origin header is not a loopback address.');
      }
    } catch {
      return forbidden('The Origin header is invalid.');
    }
  }

  return null;
}
