import { createHash } from 'node:crypto';
import {
  isAllowedRedirectUri,
  isPlausiblePkceValue,
  isPlausibleS256Challenge,
  nicknameCandidate,
  normalizeOrigin,
  sanitizeNickname,
  verifyPkce,
} from '../src/modules/auth/oauth.util.js';
import { describe, expect, it } from 'vitest';

describe('oauth.util', () => {
  it('verifies S256 and plain PKCE values', () => {
    const verifier = 'a'.repeat(43);
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    expect(isPlausiblePkceValue(verifier)).toBe(true);
    expect(isPlausibleS256Challenge(challenge)).toBe(true);
    expect(verifyPkce(verifier, challenge, 'S256')).toBe(true);
    expect(verifyPkce(verifier, challenge, 'plain')).toBe(false);
    expect(verifyPkce('b'.repeat(43), challenge, 'S256')).toBe(false);
  });

  it('only allows HTTPS or loopback HTTP callbacks', () => {
    expect(isAllowedRedirectUri('https://launcher.example/callback')).toBe(true);
    expect(isAllowedRedirectUri('http://localhost:1234/cb')).toBe(true);
    expect(isAllowedRedirectUri('http://127.0.0.1:1234/cb')).toBe(true);
    expect(isAllowedRedirectUri('http://example.com/cb')).toBe(false);
    expect(isAllowedRedirectUri('javascript:alert(1)')).toBe(false);
    expect(isAllowedRedirectUri('https://user:pass@example.com/cb')).toBe(false);
  });

  it('normalizes origins and sanitizes nicknames', () => {
    expect(normalizeOrigin('http://localhost:3000/path')).toBe('http://localhost:3000');
    expect(normalizeOrigin('not a url')).toBeNull();
    expect(sanitizeNickname('玩家 One!')).toBe('One');
    expect(sanitizeNickname('')).toBe('Player');
    expect(nicknameCandidate('Player', 0)).toBe('Player');
    expect(nicknameCandidate('Player', 1)).toMatch(/^Player_[0-9a-f]{4}$/);
  });
});
