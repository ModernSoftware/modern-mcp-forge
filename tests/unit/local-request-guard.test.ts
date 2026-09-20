import { describe, expect, test } from 'bun:test';
import { validateLocalRequest } from '$lib/server/local-request-guard';

async function responseBody(response: Response | null) {
  return response ? await response.json() : null;
}

describe('validateLocalRequest', () => {
  test.each([
    'http://localhost:5173/api/health',
    'http://127.0.0.1:5173/api/health',
    'http://[::1]:5173/api/health'
  ])('allows loopback URL %s', (url) => {
    expect(validateLocalRequest(new Request(url))).toBeNull();
  });

  test('rejects a non-loopback request URL', async () => {
    const response = validateLocalRequest(
      new Request('http://example.com/api/projects/status')
    );

    expect(response?.status).toBe(403);
    expect(await responseBody(response)).toMatchObject({ error: 'forbidden' });
  });

  test.each([
    'localhost:5173',
    '127.0.0.1:5173',
    '[::1]:5173'
  ])('allows loopback Host header %s', (host) => {
    const request = new Request('http://127.0.0.1:5173/api/health', {
      headers: { host }
    });

    expect(validateLocalRequest(request)).toBeNull();
  });

  test('rejects a non-loopback Host header', async () => {
    const request = new Request('http://127.0.0.1:5173/api/health', {
      headers: {
        host: 'example.com'
      }
    });

    const response = validateLocalRequest(request);
    expect(response?.status).toBe(403);
    expect(await responseBody(response)).toMatchObject({ error: 'forbidden' });
  });

  test('rejects an invalid Host header', async () => {
    const request = new Request('http://127.0.0.1:5173/api/health', {
      headers: {
        host: '%%invalid%%'
      }
    });

    const response = validateLocalRequest(request);
    expect(response?.status).toBe(403);
  });

  test.each([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://[::1]:5173'
  ])('allows loopback Origin header %s', (origin) => {
    const request = new Request('http://localhost:5173/api/health', {
      headers: { origin }
    });

    expect(validateLocalRequest(request)).toBeNull();
  });

  test('rejects a non-loopback Origin header', async () => {
    const request = new Request('http://localhost:5173/api/health', {
      headers: {
        origin: 'https://evil.example'
      }
    });

    const response = validateLocalRequest(request);
    expect(response?.status).toBe(403);
    expect(await responseBody(response)).toMatchObject({ error: 'forbidden' });
  });

  test('rejects an invalid Origin header', () => {
    const request = new Request('http://localhost:5173/api/health', {
      headers: {
        origin: 'not a url'
      }
    });

    expect(validateLocalRequest(request)?.status).toBe(403);
  });
});
