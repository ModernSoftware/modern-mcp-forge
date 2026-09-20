import { describe, expect, test } from 'bun:test';

import {
  FORGE_TOOL_ABI_VERSION,
  ForgeToolExecutionResponseSchema
} from '$lib/server/execution/protocol';

describe('Forge Tool ABI response schema', () => {
  test('accepts a successful text result', () => {
    const result = ForgeToolExecutionResponseSchema.parse({
      protocolVersion: FORGE_TOOL_ABI_VERSION,
      status: 'ok',
      result: {
        content: [{ type: 'text', text: 'hello' }],
        structuredContent: { value: 42 }
      }
    });

    expect(result.status).toBe('ok');
  });

  test('accepts a protocol error response', () => {
    const result = ForgeToolExecutionResponseSchema.parse({
      protocolVersion: 1,
      status: 'error',
      error: {
        code: 'FAILED',
        message: 'Failure',
        details: { retryable: false }
      }
    });

    expect(result.status).toBe('error');
  });

  test('rejects an unsupported protocol version', () => {
    expect(() => ForgeToolExecutionResponseSchema.parse({
      protocolVersion: 2,
      status: 'ok',
      result: {
        content: [{ type: 'text', text: 'hello' }]
      }
    })).toThrow();
  });

  test('requires at least one content block', () => {
    expect(() => ForgeToolExecutionResponseSchema.parse({
      protocolVersion: 1,
      status: 'ok',
      result: {
        content: []
      }
    })).toThrow();
  });

  test('rejects non-text content in ABI v1', () => {
    expect(() => ForgeToolExecutionResponseSchema.parse({
      protocolVersion: 1,
      status: 'ok',
      result: {
        content: [{ type: 'image', data: 'abc' }]
      }
    })).toThrow();
  });

  test('requires an error code and message', () => {
    expect(() => ForgeToolExecutionResponseSchema.parse({
      protocolVersion: 1,
      status: 'error',
      error: {
        code: '',
        message: ''
      }
    })).toThrow();
  });
});
