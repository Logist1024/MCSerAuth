import { createHash } from 'node:crypto';
import { NicknameReservationService } from '../src/modules/auth/nickname-reservation.service.js';
import { OAuthService } from '../src/modules/auth/oauth.service.js';
import { user } from '../src/db/schema/index.js';
import { createTestContext, type TestContext } from './helpers/db.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const USER_ID = 'user-1';
const VERIFIER = 'v'.repeat(43);

function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

describe('OAuthService', () => {
  let ctx: TestContext;
  let oauth: OAuthService;

  beforeEach(() => {
    ctx = createTestContext();
    ctx.db.db
      .insert(user)
      .values({ id: USER_ID, email: 'user@example.com', name: 'User One' })
      .run();
    oauth = new OAuthService(ctx.config, ctx.db, new NicknameReservationService(ctx.db));
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('exchanges a single-use PKCE code and provisions a player', () => {
    const code = oauth.createAuthorizationCode({
      userId: USER_ID,
      redirectUri: 'http://localhost:1234/cb',
      codeChallenge: challengeFor(VERIFIER),
      codeChallengeMethod: 'S256',
    });

    const tokens = oauth.exchangeAuthorizationCode(
      { code, code_verifier: VERIFIER },
      { ip: '127.0.0.1', userAgent: 'vitest' },
    );

    expect(tokens.access_token).toMatch(/^mcs_at_/);
    expect(tokens.refresh_token).toMatch(/^mcs_rt_/);
    expect(tokens.user?.email).toBe('user@example.com');

    const profile = oauth.resolveAccessToken(tokens.access_token);
    expect(profile?.player?.nickname).toBe('UserOne');

    expect(() => oauth.exchangeAuthorizationCode({ code, code_verifier: VERIFIER }, {})).toThrow();
  });

  it('rejects mismatched PKCE, client and redirect bindings', () => {
    const code = oauth.createAuthorizationCode({
      userId: USER_ID,
      clientId: 'client-a',
      redirectUri: 'http://localhost:1234/cb',
      codeChallenge: challengeFor(VERIFIER),
      codeChallengeMethod: 'S256',
    });

    expect(() =>
      oauth.exchangeAuthorizationCode(
        { code, code_verifier: 'w'.repeat(43), client_id: 'client-a' },
        {},
      ),
    ).toThrow();
    expect(() =>
      oauth.exchangeAuthorizationCode({ code, code_verifier: VERIFIER, client_id: 'client-b' }, {}),
    ).toThrow();
    expect(() =>
      oauth.exchangeAuthorizationCode(
        { code, code_verifier: VERIFIER, redirect_uri: 'http://localhost:9999/cb' },
        {},
      ),
    ).toThrow();
  });

  it('rejects expired authorization codes', () => {
    const code = oauth.createAuthorizationCode({
      userId: USER_ID,
      redirectUri: 'http://localhost:1234/cb',
    });
    ctx.sqlite
      .prepare('update oauth_code set expires_at = ?')
      .run(Math.floor((Date.now() - 1_000) / 1000));

    expect(() => oauth.exchangeAuthorizationCode({ code }, {})).toThrow(/过期/);
  });

  it('rotates refresh tokens and rejects reuse of the old one', () => {
    const code = oauth.createAuthorizationCode({
      userId: USER_ID,
      redirectUri: 'http://localhost:1234/cb',
    });
    const tokens = oauth.exchangeAuthorizationCode({ code }, {});

    const rotated = oauth.refreshAccessToken(tokens.refresh_token, {});
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
    expect(oauth.resolveAccessToken(tokens.access_token)).toBeNull();
    expect(() => oauth.refreshAccessToken(tokens.refresh_token, {})).toThrow();
  });
});
