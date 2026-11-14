import { describe, expect, it } from 'vitest';
import { isSafeRelativePath } from './safe-path';

describe('isSafeRelativePath', () => {
  it('accepts same-origin relative paths', () => {
    expect(isSafeRelativePath('/forum')).toBe(true);
    expect(isSafeRelativePath('/users/abc?tab=posts')).toBe(true);
  });

  it('rejects protocol-relative URLs and backslash tricks', () => {
    expect(isSafeRelativePath('//evil.com')).toBe(false);
    expect(isSafeRelativePath('/\\evil.com')).toBe(false);
  });

  it('rejects absolute URLs and empty values', () => {
    expect(isSafeRelativePath('https://evil.com')).toBe(false);
    expect(isSafeRelativePath('')).toBe(false);
    expect(isSafeRelativePath(null)).toBe(false);
    expect(isSafeRelativePath(undefined)).toBe(false);
  });
});
