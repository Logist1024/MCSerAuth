import { ApiError, ProtocolApiError } from './api-client';
import { AuthClientError } from './auth-client';

/** Human-readable error text for any API client failure. */
export function describeApiError(error: unknown): string {
  if (error instanceof ProtocolApiError) {
    return `${error.protocolError}（HTTP ${error.status}）：${error.message}`;
  }
  if (error instanceof ApiError) {
    return `${error.message}（HTTP ${error.status}）`;
  }
  if (error instanceof AuthClientError) {
    return `${error.message}（HTTP ${error.status}）`;
  }
  return error instanceof Error ? error.message : String(error);
}
