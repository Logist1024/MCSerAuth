/**
 * Shared pieces of the Commons-Designs protocol.
 *
 * The protocol deliberately bypasses the unified `{ code, data }` envelope:
 * every protocol endpoint answers with its native shape, and failures use the
 * `{ error, errorMessage }` object below.
 *
 * NOTE (M0): the protocol document is not vendored in this repository yet.
 * Field names are provisional and must be reconciled one-by-one against the
 * official spec — see docs/protocol-checklist.md.
 */

export interface ProtocolErrorBody {
  error: string;
  errorMessage: string;
  /** Optional developer-facing detail; must never leak secrets. */
  cause?: string;
}

export const ProtocolErrorName = {
  ILLEGAL_ARGUMENT: 'IllegalArgumentException',
  FORBIDDEN_OPERATION: 'ForbiddenOperationException',
  UNAUTHORIZED: 'UnauthorizedException',
  NOT_FOUND: 'NotFoundException',
  NOT_IMPLEMENTED: 'NotImplementedException',
  INTERNAL: 'InternalServerException',
} as const;

export type ProtocolErrorName = (typeof ProtocolErrorName)[keyof typeof ProtocolErrorName];

/** Maps an HTTP status onto the protocol error name used in `{ error }`. */
export function protocolErrorNameForHttpStatus(status: number): ProtocolErrorName {
  switch (status) {
    case 400:
    case 413:
    case 415:
    case 422:
      return ProtocolErrorName.ILLEGAL_ARGUMENT;
    case 401:
      return ProtocolErrorName.UNAUTHORIZED;
    case 403:
      return ProtocolErrorName.FORBIDDEN_OPERATION;
    case 404:
      return ProtocolErrorName.NOT_FOUND;
    case 501:
      return ProtocolErrorName.NOT_IMPLEMENTED;
    default:
      return ProtocolErrorName.INTERNAL;
  }
}

export const PROTOCOL_TOKEN_TYPE = 'Bearer';

/** UUIDs in the protocol are lowercase hex without dashes. */
export const PROTOCOL_UUID_PATTERN = /^[0-9a-f]{32}$/;

/**
 * Accepts dashless protocol UUIDs as well as the dashed RFC 4122 form used by
 * some launchers/servers, returning the canonical dashless lowercase value.
 */
export function normalizeProtocolUuid(value: string): string | null {
  const normalized = value.replaceAll('-', '').toLowerCase();
  return PROTOCOL_UUID_PATTERN.test(normalized) ? normalized : null;
}
