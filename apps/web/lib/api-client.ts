/**
 * Typed API client for the unified `{ code, data }` envelope.
 *
 * Commons-Designs protocol endpoints deliberately bypass this envelope (their
 * native error shape is `{ error, errorMessage }`) — use `protocolFetch` for
 * those so callers keep the protocol contract intact.
 */
import {
  ErrorCode,
  isApiSuccess,
  type ApiResponse,
  type HealthData,
  type ProtocolErrorBody,
} from '@mcserauth/shared';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

/** Failure of a unified-envelope endpoint (business code + HTTP status). */
export class ApiError extends Error {
  readonly code: number;
  readonly status: number;

  constructor(code: number, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/** Failure of a Commons-Designs protocol endpoint (`{ error, errorMessage }`). */
export class ProtocolApiError extends Error {
  readonly protocolError: string;
  readonly status: number;

  constructor(protocolError: string, message: string, status: number) {
    super(message);
    this.name = 'ProtocolApiError';
    this.protocolError = protocolError;
    this.status = status;
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(
      ErrorCode.INTERNAL,
      `API 返回了非 JSON 响应（HTTP ${response.status}）`,
      response.status,
    );
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

/** Calls a unified-envelope endpoint and returns `data` or throws `ApiError`. */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      cache: rest.cache ?? 'no-store',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new ApiError(
      ErrorCode.SERVICE_UNAVAILABLE,
      `无法连接 API 服务（${API_BASE_URL}）：${error instanceof Error ? error.message : String(error)}`,
      0,
    );
  }

  const payload = await readJson(response);
  const envelope = payload as ApiResponse<T> | undefined;

  if (envelope !== undefined && !isApiSuccess(envelope)) {
    throw new ApiError(envelope.code, envelope.message, response.status);
  }
  if (!response.ok || envelope === undefined) {
    throw new ApiError(
      ErrorCode.INTERNAL,
      `API 请求失败（HTTP ${response.status}）`,
      response.status,
    );
  }
  return envelope.data;
}

/** Calls a Commons-Designs endpoint, preserving its native error contract. */
export async function protocolFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      cache: rest.cache ?? 'no-store',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new ProtocolApiError(
      'ConnectionException',
      `无法连接 API 服务（${API_BASE_URL}）：${error instanceof Error ? error.message : String(error)}`,
      0,
    );
  }

  const payload = (await readJson(response)) as (T & Partial<ProtocolErrorBody>) | undefined;

  if (!response.ok || (payload !== undefined && 'error' in payload)) {
    const errorBody = payload as Partial<ProtocolErrorBody> | undefined;
    throw new ProtocolApiError(
      errorBody?.error ?? 'InternalServerException',
      errorBody?.errorMessage ?? `协议请求失败（HTTP ${response.status}）`,
      response.status,
    );
  }
  return payload as T;
}

/** `GET /health` — 服务与 SQLite 探活（统一封装）。 */
export function fetchHealth(): Promise<HealthData> {
  return apiFetch<HealthData>('/health');
}
