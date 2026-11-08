import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateEnv } from '../src/config/env.js';

/**
 * `validateEnv` cross-checks combinations zod cannot express (production-only
 * loopback URLs, dev-default secrets). These cases pin the production guards:
 * a misconfigured deployment must fail loudly at boot, not generate
 * `http://localhost:8000` verification links.
 */
const PRODUCTION_BASE = {
  NODE_ENV: 'production',
  COOKIE_SECURE: 'true',
  BETTER_AUTH_SECRET: 'p'.repeat(48),
  APP_URL: 'https://example.com',
  AUTH_URL: 'https://auth.example.com',
} satisfies Record<string, string>;

describe('validateEnv production guards', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a fully configured production environment', () => {
    expect(() => validateEnv({ ...PRODUCTION_BASE })).not.toThrow();
  });

  it('rejects loopback APP_URL / AUTH_URL in production', () => {
    for (const loopback of [
      'http://localhost:3000',
      'http://127.0.0.1:8000',
      'http://[::1]:8000',
      'http://0.0.0.0:8000',
    ]) {
      expect(() => validateEnv({ ...PRODUCTION_BASE, APP_URL: loopback }), loopback).toThrow(
        /APP_URL must not point at a loopback address in production/,
      );
      expect(() => validateEnv({ ...PRODUCTION_BASE, AUTH_URL: loopback }), loopback).toThrow(
        /AUTH_URL must not point at a loopback address in production/,
      );
    }
  });

  it('keeps loopback URLs legal outside production', () => {
    expect(() =>
      validateEnv({ APP_URL: 'http://localhost:3000', AUTH_URL: 'http://localhost:8000' }),
    ).not.toThrow();
  });

  it('warns without aborting when production mail stays on the console provider', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => validateEnv({ ...PRODUCTION_BASE })).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('MAIL_PROVIDER=console'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('never delivered'));
  });

  it('does not warn about the console provider outside production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    validateEnv({});
    expect(warn).not.toHaveBeenCalled();
  });
});
