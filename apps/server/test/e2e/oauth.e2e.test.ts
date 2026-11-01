import { createHash, randomBytes } from 'node:crypto';
import { beforeAll, afterAll, expect, test, vi } from 'vitest';

vi.setConfig({ testTimeout: 60_000 });

import {
  createE2eContext,
  registerVerifiedUser,
  type Actor,
  type E2eContext,
} from '../helpers/e2e.js';

// Chain 2 (guide §5.2): the browser OAuth flow — entry (login/consent pages)
// → authorization code with PKCE → token exchange → refresh rotation, plus
// the reuse and tamper error paths. Protocol endpoints fail with
// {error, errorMessage}, never the envelope.

let ctx: E2eContext;
let user: Actor;
const clientId = 'e2e-launcher';
const redirectUri = 'http://localhost:3000/oauth/callback';

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

  // A missing verifier on an S256 code is a client bug (bad request).
  const { code: code2 } = await requestCode(pkcePair());
  const missing = await ctx
    .request()
    .post('/api/oauth/authenticate')
    .send({ code: code2, client_id: clientId, redirect_uri: redirectUri });
  expect(missing.status).toBe(400);
  expect(missing.body.error).toBe('IllegalArgumentException');
});

test('authorization codes are single-use', async () => {
  const pair = pkcePair();
  const { code } = await requestCode(pair);
  const first = await ctx.request().post('/api/oauth/authenticate').send({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: pair.verifier,
  });
  expect(first.status).toBe(200);

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
