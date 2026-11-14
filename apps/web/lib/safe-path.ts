/**
 * True when the value is a same-origin relative redirect target.
 *
 * Rejects protocol-relative URLs (`//evil.com`) and backslash tricks
 * (`/\evil.com`, which browsers may treat as `//evil.com`).
 */
export function isSafeRelativePath(value: string | null | undefined): value is string {
  return (
    value !== null &&
    value !== undefined &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\')
  );
}
