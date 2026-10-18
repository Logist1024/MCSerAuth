/** Unified HTTP response envelope used by all non-protocol endpoints. */
export interface ApiSuccess<T> {
  code: 0;
  data: T;
}

export interface ApiFailure {
  code: number;
  message: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function isApiSuccess<T>(response: ApiResponse<T>): response is ApiSuccess<T> {
  return 'data' in response;
}
