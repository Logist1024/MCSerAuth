import { describe, expect, it } from 'vitest';
import {
  CSP_NONCE_KEY,
  docsCsp,
  generateCspNonce,
  isDocsPath,
  strictCsp,
} from '../src/common/csp.js';
import { renderEntryConsentPage, renderEntryLoginPage } from '../src/modules/auth/entry-page.js';

const entryQuery = {
  client_id: 'launcher',
  redirect_uri: 'http://localhost:25934/callback',
  response_type: 'code' as const,
  state: 'st-1',
  code_challenge: 'challenge-1',
  code_challenge_method: 'S256' as const,
};

describe('CSP policies', () => {
  it('binds script-src and style-src to the per-request nonce', () => {
    const policy = strictCsp('abc123==');

    expect(policy).toContain("script-src 'self' 'nonce-abc123=='");
    expect(policy).toContain("style-src 'self' 'nonce-abc123=='");
    // The strict policy must not fall back to inline execution.
    expect(policy).not.toContain('unsafe-inline');
  });

  it('allows the configured captcha providers by origin', () => {
    const policy = strictCsp(generateCspNonce());

    expect(policy).toContain('https://challenges.cloudflare.com');
    expect(policy).toContain('https://js.hcaptcha.com');
    expect(policy).toContain('frame-src https://challenges.cloudflare.com');
  });

  it('gives swagger-ui a relaxed policy without a nonce', () => {
    const policy = docsCsp();

    expect(policy).toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).not.toContain('nonce-');
  });

  it('routes paths between strict and docs policies', () => {
    expect(isDocsPath('/docs')).toBe(true);
    expect(isDocsPath('/docs/json')).toBe(true);
    expect(isDocsPath('/api/oauth/entry')).toBe(false);
    expect(isDocsPath('/health')).toBe(false);
  });

  it('generates a unique base64 nonce per call', () => {
    const first = generateCspNonce();
    const second = generateCspNonce();

    expect(first).not.toBe(second);
    expect(Buffer.from(first, 'base64')).toHaveLength(16);
  });

  it('exposes the nonce key used by the middleware and controller', () => {
    expect(CSP_NONCE_KEY).toBe('cspNonce');
  });
});

describe('entry pages carry the CSP nonce', () => {
  it('nonces the inline style and login script', () => {
    const html = renderEntryLoginPage(
      { appUrl: 'http://localhost:3000', query: entryQuery },
      'n-1',
    );

    expect(html).toContain('<style nonce="n-1">');
    expect(html).toContain('<script nonce="n-1">');
    expect(html).not.toContain('<style>');
    expect(html).not.toContain('<script>');
  });

  it('nonces the consent page style and avoids inline style attributes', () => {
    const html = renderEntryConsentPage(
      {
        appUrl: 'http://localhost:3000',
        query: { ...entryQuery, redirect_uri: entryQuery.redirect_uri },
        account: { name: 'Alice', email: 'alice@example.com' },
        player: { nickname: 'Steve', uuid: 'uuid-1', banned: true },
      },
      'n-2',
    );

    expect(html).toContain('<style nonce="n-2">');
    expect(html).toContain('<span class="banned">已被封禁</span>');
    expect(html).not.toContain('style="');
  });
});
