import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, ProtocolApiError, requestEnvelope, requestProtocol } from './http';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('http client', () => {
  it('unwraps the unified envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 0, data: { ok: true } })),
    );

    await expect(requestEnvelope<{ ok: boolean }>('/health')).resolves.toEqual({ ok: true });
  });

  it('throws ApiError with the business code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ code: 10002, message: '未登录' }, 401)),
    );

    await expect(requestEnvelope('/api/user/settings')).rejects.toMatchObject({
      name: 'ApiError',
      code: 10002,
      status: 401,
    });
  });

  it('reports non-JSON responses as ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>oops</html>', { status: 200 })),
    );

    await expect(requestEnvelope('/broken')).rejects.toBeInstanceOf(ApiError);
  });

  it('preserves the protocol error contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ error: 'ForbiddenOperationException', errorMessage: '令牌无效' }, 403),
      ),
    );

    await expect(requestProtocol('/api/oauth/refresh')).rejects.toMatchObject({
      name: 'ProtocolApiError',
      protocolError: 'ForbiddenOperationException',
      status: 403,
    });
  });

  it('maps timeouts to a readable ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const error = new Error('aborted');
        error.name = 'TimeoutError';
        throw error;
      }),
    );

    await expect(requestEnvelope('/slow')).rejects.toThrow(/请求超时/);
  });

  it('keeps protocol connection failures as ProtocolApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    await expect(requestProtocol('/api/oauth/refresh')).rejects.toBeInstanceOf(ProtocolApiError);
  });
});
