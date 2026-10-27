/** Normalizes a full URL (or origin) to a comparable `scheme://host[:port]`. */
export function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** True when the header value's origin is one of the configured origins. */
export function isTrustedOrigin(
  value: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  if (value === undefined || value === '') {
    return false;
  }
  const actual = normalizeOrigin(value);
  if (actual === null) {
    return false;
  }
  return allowedOrigins.some((allowed) => normalizeOrigin(allowed) === actual);
}
