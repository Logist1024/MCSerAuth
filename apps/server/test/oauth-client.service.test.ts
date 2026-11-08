import { OAuthClientService } from '../src/modules/auth/oauth-client.service.js';
import { OAuthService } from '../src/modules/auth/oauth.service.js';
import { NicknameReservationService } from '../src/modules/auth/nickname-reservation.service.js';
import { user } from '../src/db/schema/index.js';
import { createTestContext, type TestContext } from './helpers/db.js';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('OAuthClientService', () => {
  let ctx: TestContext;
  let clients: OAuthClientService;
  let oauth: OAuthService;

  beforeEach(async () => {
    ctx = await createTestContext();
    clients = new OAuthClientService(ctx.db);
    oauth = new OAuthService(ctx.config, ctx.db, new NicknameReservationService(ctx.db), clients);
  });
  afterEach(async () => {
    await ctx.cleanup();
  });

  it('creates a client, normalizes scopes and hides the secret hash', async () => {
    const created = await clients.createClient({
      name: '语音服务',
      redirectUris: ['https://voice.example.com/cb'],
      allowedScopes: ['basic', 'player', 'email'],
      clientSecret: 'mcs_cs_plain-secret-1',
    });
    expect(created.clientId).toMatch(/^mcs_cli_/);
    expect(created.clientSecret).toBe('mcs_cs_plain-secret-1');
    expect(created.confidential).toBe(true);
    expect(created.allowedScopes).toEqual(['basic', 'player', 'email']);

    const view = await clients.updateClient(created.clientId, { description: 'x' });
    expect(view.clientSecret).toBeUndefined();
    expect(view.confidential).toBe(true);
  });

  it('rejects duplicate client ids and unregistered redirect schemes', async () => {
    const created = await clients.createClient({
      clientId: 'voice-service',
      name: '语音服务',
      redirectUris: ['https://voice.example.com/cb'],
    });
    await expect(
      clients.createClient({
        clientId: 'voice-service',
        name: 'again',
        redirectUris: ['https://x.example.com/cb'],
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      clients.createClient({ name: 'bad', redirectUris: ['javascript:alert(1)'] }),
    ).rejects.toThrow(BadRequestException);
    expect((await clients.findClient('voice-service'))?.id).toBe(created.id);
  });

  it('validates redirect exact match and scope allow-list', async () => {
    const created = await clients.createClient({
      clientId: 'voice-service',
      name: '语音服务',
      redirectUris: ['https://voice.example.com/cb'],
      allowedScopes: ['basic', 'player'],
    });
    const client = (await clients.findClient('voice-service'))!;
    expect(() => clients.assertRedirectAllowed(client, 'https://evil.example.com/cb')).toThrow(
      BadRequestException,
    );
    expect(() =>
      clients.assertRedirectAllowed(client, 'https://voice.example.com/cb'),
    ).not.toThrow();
    expect(clients.resolveRequestedScopes(client, 'basic player')).toEqual(['basic', 'player']);
    expect(clients.resolveRequestedScopes(client, undefined)).toEqual(['basic', 'player']);
    expect(() => clients.resolveRequestedScopes(client, 'basic email')).toThrow(
      BadRequestException,
    );
    expect(() => clients.resolveRequestedScopes(client, 'basic nonsense')).toThrow(
      BadRequestException,
    );
    expect(created.id).toBeGreaterThan(0);
  });

  it('verifyClientSecret enforces confidential clients only', async () => {
    const created = await clients.createClient({
      clientId: 'confidential',
      name: '机密客户端',
      redirectUris: ['https://a.example.com/cb'],
      clientSecret: 'mcs_cs_original-secret',
    });
    const client = (await clients.findClient('confidential'))!;
    expect(() => clients.verifyClientSecret(client, undefined)).toThrow(BadRequestException);
    expect(() => clients.verifyClientSecret(client, 'wrong-secret')).toThrow(UnauthorizedException);
    expect(() => clients.verifyClientSecret(client, created.clientSecret!)).not.toThrow();

    const rotated = await clients.resetClientSecret('confidential');
    const refreshed = (await clients.findClient('confidential'))!;
    expect(() => clients.verifyClientSecret(refreshed, created.clientSecret!)).toThrow();
    expect(() => clients.verifyClientSecret(refreshed, rotated.clientSecret!)).not.toThrow();

    await clients.createClient({
      clientId: 'public-client',
      name: '公开客户端',
      redirectUris: ['https://b.example.com/cb'],
      clientSecret: undefined,
    });
    // A public client (no secret) skips the secret check entirely.
    const publicClient = (await clients.findClient('public-client'))!;
    expect(publicClient.clientSecretHash).toBeNull();
    expect(() => clients.verifyClientSecret(publicClient, undefined)).not.toThrow();
  });

  it('remembers consent, covers subsets and revokes tokens with it', async () => {
    await ctx.db.db.insert(user).values({ id: 'user-1', email: 'u@example.com', name: 'User One' });
    const createdClient = await clients.createClient({
      clientId: 'voice-service',
      name: '语音服务',
      redirectUris: ['https://voice.example.com/cb'],
      allowedScopes: ['basic', 'player', 'email'],
      clientSecret: 'mcs_cs_plain-secret-1',
    });
    const clientSecret = createdClient.clientSecret!;
    const client = (await clients.findClient('voice-service'))!;

    await clients.saveConsent('user-1', 'voice-service', ['basic', 'player']);
    const consent = (await clients.findConsent('user-1', 'voice-service'))!;
    expect(clients.consentCovers(consent, ['basic', 'player'])).toBe(true);
    expect(clients.consentCovers(consent, ['basic', 'email'])).toBe(false);

    // Widening merges; a request inside the merged scope is covered.
    await clients.saveConsent('user-1', 'voice-service', ['email']);
    const widened = (await clients.findConsent('user-1', 'voice-service'))!;
    expect(clients.consentCovers(widened, ['basic', 'player', 'email'])).toBe(true);

    // Consent revocation kills the tokens that client holds for this user.
    const code = await oauth.createAuthorizationCode({
      userId: 'user-1',
      clientId: 'voice-service',
      redirectUri: 'https://voice.example.com/cb',
      scope: 'basic player',
    });
    const tokens = await oauth.exchangeAuthorizationCode(
      {
        code,
        client_id: 'voice-service',
        client_secret: clientSecret,
        redirect_uri: 'https://voice.example.com/cb',
      },
      { ip: '127.0.0.1', userAgent: 'vitest' },
    );
    expect(await clients.revokeConsent('user-1', 'voice-service', true)).toBe(true);
    expect(await oauth.resolveAccessToken(tokens.access_token)).toBeNull();
    expect(await clients.findConsent('user-1', 'voice-service')).toBeNull();
    expect(client.clientId).toBe('voice-service');
  });

  it('issues tokens tagged with clientId and scope, then filters userinfo by scope', async () => {
    await ctx.db.db.insert(user).values({ id: 'user-1', email: 'u@example.com', name: 'User One' });
    const createdClient = await clients.createClient({
      clientId: 'voice-service',
      name: '语音服务',
      redirectUris: ['https://voice.example.com/cb'],
      allowedScopes: ['basic', 'player', 'email'],
      clientSecret: 'mcs_cs_plain-secret-1',
    });
    const clientSecret = createdClient.clientSecret!;
    const code = await oauth.createAuthorizationCode({
      userId: 'user-1',
      clientId: 'voice-service',
      redirectUri: 'https://voice.example.com/cb',
      scope: 'basic player',
    });
    const tokens = await oauth.exchangeAuthorizationCode(
      {
        code,
        client_id: 'voice-service',
        client_secret: clientSecret,
        redirect_uri: 'https://voice.example.com/cb',
      },
      { ip: '127.0.0.1', userAgent: 'vitest' },
    );
    expect(tokens.scope).toBe('basic player');

    const info = await oauth.resolveUserInfo(tokens.access_token);
    expect(info?.user.id).toBe('user-1');
    expect(info?.user.email).toBeUndefined();
    expect(info?.player?.uuid).toMatch(/^[0-9a-f]{32}$/);

    // email scope unlocks the email field; legacy (scope-less) tokens keep the full view.
    const emailCode = await oauth.createAuthorizationCode({
      userId: 'user-1',
      clientId: 'voice-service',
      redirectUri: 'https://voice.example.com/cb',
      scope: 'email',
    });
    const emailTokens = await oauth.exchangeAuthorizationCode(
      {
        code: emailCode,
        client_id: 'voice-service',
        client_secret: clientSecret,
        redirect_uri: 'https://voice.example.com/cb',
      },
      { ip: '127.0.0.1', userAgent: 'vitest' },
    );
    const emailInfo = await oauth.resolveUserInfo(emailTokens.access_token);
    expect(emailInfo?.user.email).toBe('u@example.com');
    expect(emailInfo?.player).toBeUndefined();
  });
});
