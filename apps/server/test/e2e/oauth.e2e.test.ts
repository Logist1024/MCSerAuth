import { createHash, randomBytes } from 'node:crypto';
import { beforeAll, afterAll, expect, test, vi } from 'vitest';

vi.setConfig({ testTimeout: 60_000 });

import {
  createE2eContext,
  promoteToRole,
  registerVerifiedUser,
  type Actor,
  type E2eContext,
} from '../helpers/e2e.js';
import { oauthClient } from '../../src/db/schema/index.js';

// Chain 2 (guide §5.2): the browser OAuth flow — entry (login/consent pages)
// → authorization code with PKCE → token exchange → refresh rotation, plus
// the reuse and tamper error paths. Protocol endpoints fail with
// {error, errorMessage}, never the envelope.

let ctx: E2eContext;
let user: Actor;
const clientId = 'e2e-launcher';
const redirectUri = 'http://localhost:3000/oauth/callback';
let publicClientTokens: { access: string; refresh: string };

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

interface CodeResult {
  code: string;
  state: string;
}

async function requestCode(pair: { verifier: string; challenge: string }): Promise<CodeResult> {
  const state = randomBytes(8).toString('hex');
  const entry = await ctx.request().post('/api/oauth/entry').set('Cookie', user.cookie).send({
    redirect_uri: redirectUri,
    client_id: clientId,
    response_type: 'code',
    state,
    code_challenge: pair.challenge,
    code_challenge_method: 'S256',
  });
  expect(entry.status).toBe(302);
  const location = new URL(entry.headers.location as string);
  expect(location.pathname + location.search).toContain('code=');
  return { code: location.searchParams.get('code') as string, state };
}

beforeAll(async () => {
  ctx = await createE2eContext();
  user = await registerVerifiedUser(ctx);
  // Registered clients are validated strictly; seed the client this suite plays.
  await ctx.db.db.insert(oauthClient).values({
    clientId,
    name: 'E2E Launcher',
    redirectUris: [redirectUri],
    allowedScopes: ['basic', 'player', 'email'],
    updatedAt: new Date(),
  });
});

afterAll(async () => {
  await ctx.close();
});

test('entry renders an HTML login page for guests and a consent page for sessions', async () => {
  const guest = await ctx
    .request()
    .get('/api/oauth/entry')
    .query({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code' });
  expect(guest.status).toBe(200);
  expect(guest.headers['content-type']).toContain('text/html');
  expect(guest.headers['content-security-policy']).toContain('nonce-');

  const session = await ctx
    .request()
    .get('/api/oauth/entry')
    .query({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code' })
    .set('Cookie', user.cookie);
  expect(session.status).toBe(200);
  expect(session.headers['content-type']).toContain('text/html');
});

test('the full PKCE exchange mints tokens that call the launcher profile', async () => {
  const pair = pkcePair();
  const { code, state } = await requestCode(pair);
  expect(state).toBeTruthy();

  const exchange = await ctx.request().post('/api/oauth/authenticate').send({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: pair.verifier,
  });
  expect(exchange.status).toBe(200);
  expect(exchange.body.access_token).toMatch(/^mcs_at_/);
  expect(exchange.body.refresh_token).toMatch(/^mcs_rt_/);
  expect(exchange.body.user.email).toBe(user.email);

  const profile = await ctx
    .request()
    .get('/api/user/profiles/me')
    .set('Authorization', `Bearer ${exchange.body.access_token}`);
  expect(profile.status).toBe(200);
  expect(profile.body.player).not.toBeNull();
  expect(profile.body.player.nickname).toBe(user.name);
});

test('a wrong PKCE verifier is rejected with the protocol error shape', async () => {
  const pair = pkcePair();
  const { code } = await requestCode(pair);
  const tampered = await ctx
    .request()
    .post('/api/oauth/authenticate')
    .send({
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: `${pair.verifier.slice(0, -2)}xx`,
    });
  expect(tampered.status).toBe(401);
  expect(tampered.body.error).toBe('UnauthorizedException');
  expect(typeof tampered.body.errorMessage).toBe('string');

  // A missing verifier on an S256 code is a client bug (bad request). Both
  // failures happen before the code is claimed, so it is still spendable.
  const missing = await ctx
    .request()
    .post('/api/oauth/authenticate')
    .send({ code, client_id: clientId, redirect_uri: redirectUri });
  expect(missing.status).toBe(400);
  expect(missing.body.error).toBe('IllegalArgumentException');

  const recovery = await ctx.request().post('/api/oauth/authenticate').send({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: pair.verifier,
  });
  expect(recovery.status).toBe(200);

  // Authorization codes are single-use: the replay is rejected.
  const replay = await ctx.request().post('/api/oauth/authenticate').send({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: pair.verifier,
  });
  expect(replay.status).toBe(401);
  expect(replay.body.error).toBe('UnauthorizedException');
});

test('refresh rotates: the old pair dies with the first use', async () => {
  const pair = pkcePair();
  const { code } = await requestCode(pair);
  const exchange = await ctx.request().post('/api/oauth/authenticate').send({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: pair.verifier,
  });
  const { access_token, refresh_token } = exchange.body;

  const rotated = await ctx
    .request()
    .post('/api/oauth/refresh')
    .send({ refresh_token, client_id: clientId });
  expect(rotated.status).toBe(200);
  expect(rotated.body.refresh_token).not.toBe(refresh_token);

  // The old access token is revoked immediately...
  const staleAccess = await ctx
    .request()
    .get('/api/user/profiles/me')
    .set('Authorization', `Bearer ${access_token}`);
  expect(staleAccess.status).toBe(401);

  // ...and the old refresh token cannot be replayed.
  const replayedRefresh = await ctx
    .request()
    .post('/api/oauth/refresh')
    .send({ refresh_token, client_id: clientId });
  expect(replayedRefresh.status).toBe(401);
  expect(replayedRefresh.body.error).toBe('UnauthorizedException');

  // The rotated pair still works.
  const freshAccess = await ctx
    .request()
    .get('/api/user/profiles/me')
    .set('Authorization', `Bearer ${rotated.body.access_token}`);
  expect(freshAccess.status).toBe(200);
});

// Registered sibling-service client: admin registration, remembered consent
// (one-click re-login), scope-filtered userinfo and per-user revocation.
test('registered client: consent remember → one-click re-login → userinfo → revoke', async () => {
  const admin = await registerVerifiedUser(ctx);
  await promoteToRole(ctx, admin, 'superadmin');

  // 1. Register the sibling-service client via the admin API.
  const created = await ctx
    .request()
    .post('/api/admin/oauth-clients')
    .set('Cookie', admin.cookie)
    .send({
      clientId: 'sibling-app',
      name: '兄弟服务',
      redirectUris: ['https://sibling.example.com/cb'],
      allowedScopes: ['basic', 'player', 'email'],
      clientSecret: 'sibling-secret-123',
    });
  expect(created.status).toBe(200);
  expect(created.body.data.clientSecret).toBe('sibling-secret-123');
  expect(created.body.data.confidential).toBe(true);

  const pair = pkcePair();
  const scope = 'basic player email';

  // 2. First login: consent page is shown; submitting with remember stores the grant.
  const consentPage = await ctx
    .request()
    .get('/api/oauth/entry')
    .query({
      client_id: 'sibling-app',
      redirect_uri: 'https://sibling.example.com/cb',
      response_type: 'code',
      scope,
    })
    .set('Cookie', user.cookie);
  expect(consentPage.text).toContain('兄弟服务');
  expect(consentPage.text).toContain('记住此授权');

  const first = await requestCodeForClient(pair, scope, true);
  const tokens = await ctx.request().post('/api/oauth/authenticate').send({
    code: first.code,
    client_id: 'sibling-app',
    client_secret: 'sibling-secret-123',
    redirect_uri: 'https://sibling.example.com/cb',
    code_verifier: pair.verifier,
  });
  expect(tokens.status).toBe(200);
  expect(tokens.body.scope).toBe('basic player email');

  // 3. Userinfo: scope filter — email present, player UUID present.
  const info = await ctx
    .request()
    .get('/api/oauth/userinfo')
    .set('Authorization', `Bearer ${tokens.body.access_token}`);
  expect(info.status).toBe(200);
  expect(info.body.user.email).toBeDefined();
  expect(info.body.player?.uuid).toMatch(/^[0-9a-f]{32}$/);
  expect(info.body.error).toBeUndefined();

  // Wrong secret is rejected with the protocol error shape.
  const tamperPair = pkcePair();
  const tamper = await requestCodeForClient(tamperPair, scope, false);
  const wrongSecret = await ctx.request().post('/api/oauth/authenticate').send({
    code: tamper.code,
    client_id: 'sibling-app',
    client_secret: 'nope',
    redirect_uri: 'https://sibling.example.com/cb',
  });
  expect(wrongSecret.status).toBe(401);
  expect(wrongSecret.body.error).toBe('UnauthorizedException');

  // 4. One-click re-login: remembered consent covers the scopes → direct 302.
  const secondPair = pkcePair();
  const skip = await ctx
    .request()
    .get('/api/oauth/entry')
    .query({
      client_id: 'sibling-app',
      redirect_uri: 'https://sibling.example.com/cb',
      response_type: 'code',
      scope,
      state: 'again',
      code_challenge: secondPair.challenge,
      code_challenge_method: 'S256',
    })
    .set('Cookie', user.cookie);
  expect(skip.status).toBe(302);
  expect(skip.headers.location).toContain('code=');

  // 5. Refresh keeps the granted scope; the confidential client must
  // re-authenticate with its secret (RFC 6749 §6).
  const refreshed = await ctx.request().post('/api/oauth/refresh').send({
    refresh_token: tokens.body.refresh_token,
    client_id: 'sibling-app',
    client_secret: 'sibling-secret-123',
  });
  expect(refreshed.status).toBe(200);
  expect(refreshed.body.scope).toBe('basic player email');

  // Refresh without the secret is rejected for confidential clients
  // (BadRequest: the confidential client must present client_secret).
  const noSecret = await ctx
    .request()
    .post('/api/oauth/refresh')
    .send({ refresh_token: refreshed.body.refresh_token, client_id: 'sibling-app' });
  expect(noSecret.status).toBe(400);

  // 6. The website shows the grant; revoking kills the tokens immediately.
  const list = await ctx.request().get('/api/user/oauth/authorizations').set('Cookie', user.cookie);
  const grant = list.body.data.items.find(
    (item: { clientId: string }) => item.clientId === 'sibling-app',
  );
  expect(grant?.clientName).toBe('兄弟服务');

  const revoked = await ctx
    .request()
    .delete('/api/user/oauth/authorizations/sibling-app')
    .set('Cookie', user.cookie);
  expect(revoked.status).toBe(200);

  const afterRevoke = await ctx
    .request()
    .get('/api/oauth/userinfo')
    .set('Authorization', `Bearer ${refreshed.body.access_token}`);
  expect(afterRevoke.status).toBe(401);
  expect(afterRevoke.body.error).toBeDefined();
});

/** Entry POST against the registered sibling client, optionally remembering the grant. */
async function requestCodeForClient(
  pair: { verifier: string; challenge: string },
  scope: string,
  remember: boolean,
): Promise<CodeResult> {
  const state = randomBytes(8).toString('hex');
  const entry = await ctx
    .request()
    .post('/api/oauth/entry')
    .set('Cookie', user.cookie)
    .send({
      redirect_uri: 'https://sibling.example.com/cb',
      client_id: 'sibling-app',
      response_type: 'code',
      scope,
      state,
      code_challenge: pair.challenge,
      code_challenge_method: 'S256',
      ...(remember ? { remember: 'on' } : {}),
    });
  expect(entry.status).toBe(302);
  const location = new URL(entry.headers.location as string);
  expect(location.pathname + location.search).toContain('code=');
  return { code: location.searchParams.get('code') as string, state };
}

// New hardening: public clients must use PKCE, registered clients must replay
// redirect_uri on exchange, and banning kills live tokens immediately.
test('public registered clients are forced through PKCE', async () => {
  await ctx.db.db.insert(oauthClient).values({
    clientId: 'e2e-public',
    name: 'E2E Public',
    redirectUris: [redirectUri],
    allowedScopes: ['basic', 'player'],
    updatedAt: new Date(),
  });
  const base = { client_id: 'e2e-public', redirect_uri: redirectUri, response_type: 'code' };

  // Without PKCE the consent submission is rejected outright.
  const noPkce = await ctx.request().post('/api/oauth/entry').set('Cookie', user.cookie).send(base);
  expect(noPkce.status).toBe(400);

  // The entry page renders the problem instead of a working form.
  const page = await ctx.request().get('/api/oauth/entry').query(base).set('Cookie', user.cookie);
  expect(page.text).toContain('公开客户端必须使用 PKCE');

  // With PKCE the flow completes; keep the tokens for the ban test below.
  const pair = pkcePair();
  const ok = await ctx
    .request()
    .post('/api/oauth/entry')
    .set('Cookie', user.cookie)
    .send({ ...base, code_challenge: pair.challenge, code_challenge_method: 'S256' });
  expect(ok.status).toBe(302);
  const code = new URL(ok.headers.location as string).searchParams.get('code') as string;
  const exchange = await ctx.request().post('/api/oauth/authenticate').send({
    code,
    client_id: 'e2e-public',
    redirect_uri: redirectUri,
    code_verifier: pair.verifier,
  });
  expect(exchange.status).toBe(200);
  publicClientTokens = { access: exchange.body.access_token, refresh: exchange.body.refresh_token };
});

test('registered clients must replay redirect_uri verbatim on exchange', async () => {
  const pair = pkcePair();
  const { code } = await requestCode(pair);

  const missing = await ctx.request().post('/api/oauth/authenticate').send({
    code,
    client_id: clientId,
    code_verifier: pair.verifier,
  });
  expect(missing.status).toBe(401);

  // The code is single-use, so request a fresh one for the mismatch case.
  const { code: code2 } = await requestCode(pkcePair());
  const wrong = await ctx.request().post('/api/oauth/authenticate').send({
    code: code2,
    client_id: clientId,
    redirect_uri: 'http://localhost:3000/other',
    code_verifier: pkcePair().verifier,
  });
  expect(wrong.status).toBe(401);
});

test('banning a user revokes their live tokens immediately', async () => {
  const admin = await registerVerifiedUser(ctx);
  await promoteToRole(ctx, admin, 'superadmin');
  const ban = await ctx
    .request()
    .post(`/api/admin/forum/users/${user.userId}/ban`)
    .set('Cookie', admin.cookie)
    .send({ reason: 'e2e' });
  expect(ban.status).toBe(200);

  const staleAccess = await ctx
    .request()
    .get('/api/oauth/userinfo')
    .set('Authorization', `Bearer ${publicClientTokens.access}`);
  expect(staleAccess.status).toBe(401);

  const staleRefresh = await ctx
    .request()
    .post('/api/oauth/refresh')
    .send({ refresh_token: publicClientTokens.refresh, client_id: 'e2e-public' });
  // Revocation (from the ban) wins over the banned check: 401, not 403.
  expect(staleRefresh.status).toBe(401);
});
