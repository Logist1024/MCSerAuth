import {
  ErrorCode,
  isApiSuccess,
  type ApiResponse,
  type ProtocolErrorBody,
} from '@mcserauth/shared';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';
export const DEFAULT_TIMEOUT_MS = 15_000;

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

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  timeoutMs?: number;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`API 返回了非 JSON 响应（HTTP ${response.status}）`);
  }
}

async function send(path: string, options: ApiFetchOptions): Promise<Response> {
  const { body, headers, timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = options;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      cache: rest.cache ?? 'no-store',
      signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: 'application/json',
        ...(body === undefined || isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
    });
  } catch (error) {
    const timedOut =
      error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new ApiError(
      ErrorCode.SERVICE_UNAVAILABLE,
      timedOut
        ? `请求超时（${Math.round(timeoutMs / 1000)} 秒）`
        : `无法连接 API 服务（${API_BASE_URL}）：${error instanceof Error ? error.message : String(error)}`,
      0,
    );
  }
}

/** Calls a unified-envelope endpoint and returns `data` or throws `ApiError`. */
export async function requestEnvelope<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const response = await send(path, options);
  let payload: unknown;
  try {
    payload = await readJson(response);
  } catch (error) {
    throw new ApiError(
      ErrorCode.INTERNAL,
      error instanceof Error ? error.message : String(error),
      response.status,
    );
  }

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
export async function requestProtocol<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await send(path, options);
  } catch (error) {
    if (error instanceof ApiError) {
      throw new ProtocolApiError('ConnectionException', error.message, error.status);
    }
    throw error;
  }
  let payload: (T & Partial<ProtocolErrorBody>) | undefined;
  try {
    payload = (await readJson(response)) as (T & Partial<ProtocolErrorBody>) | undefined;
  } catch (error) {
    throw new ProtocolApiError(
      'InternalServerException',
      error instanceof Error ? error.message : String(error),
      response.status,
    );
  }

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
