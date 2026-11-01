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

// Chain 3 (guide §5.2): the Yggdrasil trunk — authlib-injector direct login
// (authenticate → validate/refresh) and the game-server join handshake over
// the whitelisted native session endpoints, ending in the ban 403 branches.
// Every failure here must speak {error, errorMessage}.

let ctx: E2eContext;
let player: Actor;
let admin: Actor;
const clientToken = randomBytes(16).toString('hex');

beforeAll(async () => {
  ctx = await createE2eContext();
  player = await registerVerifiedUser(ctx);
  admin = await registerVerifiedUser(ctx);
  await promoteToRole(ctx, admin, 'superadmin');
});

afterAll(async () => {
  await ctx.close();
});

test('the server advertises Yggdrasil metadata without a prefix auth trip', async () => {
  const metadata = await ctx.request().get('/api');
  expect(metadata.status).toBe(200);
  expect(metadata.body.meta.implementationName).toBe('MCSerAuth');
  expect(Array.isArray(metadata.body.skinDomains)).toBe(true);
});

test('authenticate auto-creates the player and returns a selected profile', async () => {
  const auth = await ctx
    .request()
    .post('/api/authserver/authenticate')
    .send({ username: player.email, password: player.password, clientToken });
  expect(auth.status).toBe(200);
  expect(auth.body.clientToken).toBe(clientToken);
  expect(auth.body.accessToken).toBeTruthy();
  expect(auth.body.selectedProfile.name).toBe(player.name);
  expect(auth.body.selectedProfile.id).toMatch(/^[0-9a-f]{32}$/);
});

test('validate accepts the token; refresh rejects a mismatched clientToken', async () => {
  const auth = await ctx
    .request()
    .post('/api/authserver/authenticate')
    .send({ username: player.email, password: player.password, clientToken });
  const { accessToken } = auth.body;

  const validate = await ctx
    .request()
    .post('/api/authserver/validate')
    .send({ accessToken, clientToken });
  expect(validate.status).toBe(204);

  const wrongClient = await ctx
    .request()
    .post('/api/authserver/refresh')
    .send({ accessToken, clientToken: 'not-the-original' });
  expect(wrongClient.status).toBe(403);
  expect(wrongClient.body.error).toBe('ForbiddenOperationException');

  const refresh = await ctx
    .request()
    .post('/api/authserver/refresh')
    .send({ accessToken, clientToken });
  expect(refresh.status).toBe(200);
  expect(refresh.body.accessToken).toBeTruthy();
  expect(refresh.body.accessToken).not.toBe(accessToken);
});

test('wrong credentials are a protocol 403, not an envelope', async () => {
  const bad = await ctx
    .request()
    .post('/api/authserver/authenticate')
    .send({ username: player.email, password: 'definitely-wrong', clientToken });
  expect(bad.status).toBe(403);
  expect(bad.body.error).toBe('ForbiddenOperationException');
  expect(bad.body.errorMessage).toContain('password');
});

test('joinServer requires a whitelisted server, then hasJoined closes the loop', async () => {
  const serverId = createHash('sha256').update('e2e-whitelisted-server').digest('hex');

  const auth = await ctx
    .request()
    .post('/api/authserver/authenticate')
    .send({ username: player.email, password: player.password, clientToken });
  const { accessToken } = auth.body;
  const profileId = auth.body.selectedProfile.id as string;

  // NOTE: the native /api/session/* endpoints take selectedProfile as a bare
  // profile-id string (M0 shape) — unlike the standard sessionserver join that
  // accepts {id, name}. Confirming this against real launchers is F1 business.
  // Not whitelisted yet: the join is refused.
  const refused = await ctx
    .request()
    .post('/api/session/joinServer')
    .send({ accessToken, selectedProfile: profileId, serverId });
  expect(refused.status).toBe(403);
  expect(refused.body.error).toBe('ForbiddenOperationException');

  const created = await ctx
    .request()
    .post('/api/admin/servers')
    .set('Cookie', admin.cookie)
    .send({ serverId, name: 'E2E 白名单服务器' });
  expect(created.status).toBeLessThan(300);

  const join = await ctx
    .request()
    .post('/api/session/joinServer')
    .send({ accessToken, selectedProfile: profileId, serverId });
  expect(join.status).toBe(204);

  const hasJoined = await ctx
    .request()
    .get('/api/session/hasJoined')
    .query({ username: player.name, serverId });
  expect(hasJoined.status).toBe(200);
  expect(hasJoined.body.id).toBe(profileId);
  expect(hasJoined.body.name).toBe(player.name);

  // Without a join session for this server, the same player is a 204.
  const unknown = await ctx
    .request()
    .get('/api/session/hasJoined')
    .query({ username: 'never_joined', serverId });
  expect(unknown.status).toBe(204);
});

test('a game-banned player fails authenticate and hasJoined with 403', async () => {
  const banned = await registerVerifiedUser(ctx);
  const auth = await ctx
    .request()
    .post('/api/authserver/authenticate')
    .send({ username: banned.email, password: banned.password, clientToken });
  const { accessToken, selectedProfile } = auth.body;

  const ban = await ctx
    .request()
    .post(`/api/admin/forum/users/${banned.userId}/ban`)
    .set('Cookie', admin.cookie)
    .send({ reason: 'e2e 封禁', banGame: true });
  expect(ban.status).toBeLessThan(300);

  const reauth = await ctx
    .request()
    .post('/api/authserver/authenticate')
    .send({ username: banned.email, password: banned.password, clientToken });
  expect(reauth.status).toBe(403);
  expect(reauth.body.error).toBe('ForbiddenOperationException');

  // Even a token minted before the ban no longer passes the session server.
  const join = await ctx
    .request()
    .post('/api/sessionserver/session/minecraft/join')
    .send({
      accessToken,
      selectedProfile: selectedProfile.id as string,
      serverId: createHash('sha256').update('any-server').digest('hex'),
    });
  expect(join.status).toBe(403);
  expect(join.body.error).toBe('ForbiddenOperationException');
});
