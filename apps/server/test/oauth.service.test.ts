import { createHash } from 'node:crypto';
import { NicknameReservationService } from '../src/modules/auth/nickname-reservation.service.js';
import { OAuthService } from '../src/modules/auth/oauth.service.js';
import { user, oauthCode } from '../src/db/schema/index.js';
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
  beforeEach(async () => {
    ctx = await createTestContext();
    await ctx.db.db
      .insert(user)
      .values({ id: USER_ID, email: 'user@example.com', name: 'User One' });
    oauth = new OAuthService(ctx.config, ctx.db, new NicknameReservationService(ctx.db));
  });
  afterEach(async () => {
    await ctx.cleanup();
  });
  it('exchanges a single-use PKCE code and provisions a player', async () => {
    const code = await oauth.createAuthorizationCode({
      userId: USER_ID,
      redirectUri: 'http://localhost:1234/cb',
      codeChallenge: challengeFor(VERIFIER),
      codeChallengeMethod: 'S256',
    });
    const tokens = await oauth.exchangeAuthorizationCode(
      { code, code_verifier: VERIFIER },
      { ip: '127.0.0.1', userAgent: 'vitest' },
    );
    expect(tokens.access_token).toMatch(/^mcs_at_/);
    expect(tokens.refresh_token).toMatch(/^mcs_rt_/);
    expect(tokens.user?.email).toBe('user@example.com');
    const profile = await oauth.resolveAccessToken(tokens.access_token);
    expect(profile?.player?.nickname).toBe('UserOne');
    await expect(
      oauth.exchangeAuthorizationCode({ code, code_verifier: VERIFIER }, {}),
    ).rejects.toThrow();
  });
  it('rejects mismatched PKCE, client and redirect bindings', async () => {
    const code = await oauth.createAuthorizationCode({
      userId: USER_ID,
      clientId: 'client-a',
      redirectUri: 'http://localhost:1234/cb',
      codeChallenge: challengeFor(VERIFIER),
      codeChallengeMethod: 'S256',
    });
    await expect(
      oauth.exchangeAuthorizationCode(
        { code, code_verifier: 'w'.repeat(43), client_id: 'client-a' },
        {},
      ),
    ).rejects.toThrow();
    await expect(
      oauth.exchangeAuthorizationCode({ code, code_verifier: VERIFIER, client_id: 'client-b' }, {}),
    ).rejects.toThrow();
    await expect(
      oauth.exchangeAuthorizationCode(
        { code, code_verifier: VERIFIER, redirect_uri: 'http://localhost:9999/cb' },
        {},
      ),
    ).rejects.toThrow();
  });
  it('rejects expired authorization codes', async () => {
    const code = await oauth.createAuthorizationCode({
      userId: USER_ID,
      redirectUri: 'http://localhost:1234/cb',
    });
    await ctx.db.db.update(oauthCode).set({ expiresAt: new Date(Date.now() - 1000) });
    await expect(oauth.exchangeAuthorizationCode({ code }, {})).rejects.toThrow(/过期/);
  });
  it('rotates refresh tokens and rejects reuse of the old one', async () => {
    const code = await oauth.createAuthorizationCode({
      userId: USER_ID,
      redirectUri: 'http://localhost:1234/cb',
    });
    const tokens = await oauth.exchangeAuthorizationCode({ code }, {});
    const rotated = await oauth.refreshAccessToken(tokens.refresh_token, {});
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
    expect(await oauth.resolveAccessToken(tokens.access_token)).toBeNull();
    await expect(oauth.refreshAccessToken(tokens.refresh_token, {})).rejects.toThrow();
  });
});
