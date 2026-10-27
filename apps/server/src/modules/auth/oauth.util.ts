import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { normalizeOrigin } from '../../common/utils/origin.js';

export { normalizeOrigin };

/**
 * Small, dependency-free helpers for the OAuth-style launcher flow.
 * Tokens and authorization codes are random opaque strings; only their
 * SHA-256 hashes are stored.
 */

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function generateOpaqueToken(prefix: string): string {
  return `${prefix}${randomBytes(32).toString('base64url')}`;
}

/** Protocol UUIDs are 32 lowercase hex characters without dashes. */
export function generatePlayerUuid(): string {
  return randomUUID().replaceAll('-', '');
}

const PKCE_VALUE_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;
const PKCE_S256_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isPlausiblePkceValue(value: string): boolean {
  return PKCE_VALUE_PATTERN.test(value);
}

export function isPlausibleS256Challenge(value: string): boolean {
  return PKCE_S256_CHALLENGE_PATTERN.test(value);
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyPkce(verifier: string, challenge: string, method: 'S256' | 'plain'): boolean {
  if (!isPlausiblePkceValue(verifier)) {
    return false;
  }
  const expected =
    method === 'S256' ? createHash('sha256').update(verifier).digest('base64url') : verifier;
  return safeEqual(expected, challenge);
}

/**
 * Launcher callbacks must not become an open redirect.
 *
 * HTTPS is required except for loopback HTTP callbacks (desktop launchers
 * commonly listen on localhost). Custom schemes are rejected until the official
 * protocol document pins the callback format.
 */
export function isAllowedRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.username !== '' || url.password !== '') {
    return false;
  }
  if (url.protocol === 'https:') {
    return true;
  }
  if (url.protocol !== 'http:') {
    return false;
  }

  const host = url.hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

/** Minecraft Java usernames: 3–16 characters of [A-Za-z0-9_]. */
export function sanitizeNickname(displayName: string): string {
  const cleaned = displayName
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9_]/g, '')
    .slice(0, 16);

  if (cleaned.length === 0) {
    return 'Player';
  }
  return cleaned.padEnd(3, '_');
}

export function nicknameCandidate(base: string, attempt: number): string {
  if (attempt === 0) {
    return base;
  }
  const suffix = `_${randomBytes(2).toString('hex')}`;
  return `${base.slice(0, 16 - suffix.length)}${suffix}`;
}
