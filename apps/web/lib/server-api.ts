import { isApiSuccess, type ApiResponse } from '@mcserauth/shared';
import { cookies, headers } from 'next/headers';
import { API_BASE_URL } from './api-client';

export type ServerApiResult<T> = { ok: true; data: T } | { ok: false; status: number };

/**
 * Server-component fetch that forwards the browser's better-auth cookie to the
 * API (same-host deployment). Returns null on any failure so pages can render
 * empty/error states or call notFound().
 */
export async function serverApiFetch<T>(path: string): Promise<T | null> {
  const result = await serverApiFetchResult<T>(path);
  return result.ok ? result.data : null;
}

/** Same as `serverApiFetch`, but keeps the HTTP status for 401/404/5xx branches. */
export async function serverApiFetchResult<T>(path: string): Promise<ServerApiResult<T>> {
  const [cookieStore, incoming] = await Promise.all([cookies(), headers()]);
  // Nest rate-limits per IP and trusts one proxy hop. Without forwarding the
  // browser's address, every SSR visitor would share the Next server's
  // 127.0.0.1 bucket. Caddy appends the real client address on the right, so
  // Express' single-hop trust still resolves the correct IP.
  return requestApi<T>(
    path,
    cookieStore.toString(),
    undefined,
    incoming.get('x-forwarded-for') ?? undefined,
  );
}

/** Public (cookie-less) fetch for sitemap/RSS and anonymous forum reads. */
export async function publicApiFetch<T>(path: string, revalidateSeconds = 30): Promise<T | null> {
  const result = await publicApiFetchResult<T>(path, revalidateSeconds);
  return result.ok ? result.data : null;
}

/** Public fetch that keeps the status, so a 404 is not rendered as an outage. */
export async function publicApiFetchResult<T>(
  path: string,
  revalidateSeconds = 30,
): Promise<ServerApiResult<T>> {
  return await requestApi<T>(path, '', revalidateSeconds);
}

/** Cookie-forwarding fetch for Commons-Designs protocol endpoints (no envelope). */
export async function serverProtocolFetch<T>(path: string): Promise<T | null> {
  const [cookieStore, incoming] = await Promise.all([cookies(), headers()]);
  try {
    const forwardedFor = incoming.get('x-forwarded-for');
    const response = await fetch(`${API_BASE_URL}${path}`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Cookie: cookieStore.toString(),
        ...(forwardedFor === null ? {} : { 'x-forwarded-for': forwardedFor }),
      },
    });
    if (!response.ok) {
      return null;
    }
    const text = await response.text();
    if (text.length === 0) {
      return null;
    }
    const payload = JSON.parse(text) as T & { error?: unknown };
    return payload.error === undefined ? payload : null;
  } catch {
    return null;
  }
}

async function requestApi<T>(
  path: string,
  cookie: string,
  revalidateSeconds?: number,
  forwardedFor?: string,
): Promise<ServerApiResult<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...(revalidateSeconds === undefined
        ? { cache: 'no-store' as const }
        : { next: { revalidate: revalidateSeconds } }),
      headers: {
        Accept: 'application/json',
        ...(cookie === '' ? {} : { Cookie: cookie }),
        ...(forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor }),
      },
    });
    if (!response.ok) {
      return { ok: false, status: response.status };
    }
    const text = await response.text();
    if (text.length === 0) {
      return { ok: false, status: response.status };
    }
    const payload = JSON.parse(text) as ApiResponse<T>;
    return isApiSuccess(payload)
      ? { ok: true, data: payload.data }
      : { ok: false, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
