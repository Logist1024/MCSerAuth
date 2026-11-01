import { beforeAll, afterAll, expect, test, vi } from 'vitest';

vi.setConfig({ testTimeout: 60_000 });

import {
  createE2eContext,
  pngBuffer,
  promoteToRole,
  registerVerifiedUser,
  type Actor,
  type E2eContext,
} from '../helpers/e2e.js';

// Chain 4 (guide §5.2): textures — multipart upload becomes active at once,
// the signed URL actually serves bytes, tampered signatures fail closed, and
// a moderator reject rolls the player back to the default look.

let ctx: E2eContext;
let user: Actor;
let reviewer: Actor;
let textureId: string;
let signedUrl: URL;

beforeAll(async () => {
  ctx = await createE2eContext();
  user = await registerVerifiedUser(ctx);
  reviewer = await registerVerifiedUser(ctx);
  await promoteToRole(ctx, reviewer, 'reviewer');
});

afterAll(async () => {
  await ctx.close();
});

test('uploading a valid 64x64 skin approves and activates it immediately', async () => {
  const upload = await ctx
    .request()
    .post('/api/minecraft/profile/skins')
    .set('Cookie', user.cookie)
    .field('variant', 'classic')
    .attach('file', await pngBuffer(64, 64), { filename: 'skin.png', contentType: 'image/png' });
  expect(upload.status).toBe(200);
  expect(upload.body.status).toBe('approved');
  expect(upload.body.variant).toBe('classic');
  textureId = String(upload.body.id);
  signedUrl = new URL(upload.body.url);

  const skins = await ctx.request().get('/api/minecraft/profile/skins').set('Cookie', user.cookie);
  expect(skins.status).toBe(200);
  const active = skins.body.skins.find(
    (skin: { state: string; id: number }) => skin.state === 'ACTIVE',
  );
  expect(String(active?.id)).toBe(textureId);
});

test('the signed URL serves the PNG bytes; tampering fails closed', async () => {
  const ok = await ctx.request().get(signedUrl.pathname + signedUrl.search);
  expect(ok.status).toBe(200);
  expect(ok.headers['content-type']).toContain('image/png');
  expect(ok.body.length).toBeGreaterThan(0);

  const tamperedSig = await ctx
    .request()
    .get(`${signedUrl.pathname}?expires=${signedUrl.searchParams.get('expires')}&sig=deadbeef`);
  expect(tamperedSig.status).toBe(403);
  expect(tamperedSig.body.error).toBe('ForbiddenOperationException');

  const noSig = await ctx.request().get(signedUrl.pathname);
  expect(noSig.status).toBe(403);
});

test('an oversized texture is refused before it is stored', async () => {
  // 96x96 is not an original-dimension texture (64x32 / 64x64 only).
  const bad = await ctx
    .request()
    .post('/api/minecraft/profile/skins')
    .set('Cookie', user.cookie)
    .field('variant', 'classic')
    .attach('file', await pngBuffer(96, 96), { filename: 'big.png', contentType: 'image/png' });
  expect(bad.status).toBe(400);
  expect(bad.body.error).toBe('IllegalArgumentException');
});

test('a moderator reject deactivates the skin and blocks reactivation', async () => {
  const reject = await ctx
    .request()
    .post(`/api/admin/textures/${textureId}/reject`)
    .set('Cookie', reviewer.cookie)
    .send({ reason: 'e2e 下架' });
  expect(reject.status).toBeLessThan(300);
  expect(reject.body.data.status).toBe('rejected');

  // The rejected texture no longer appears as the active look.
  const skins = await ctx.request().get('/api/minecraft/profile/skins').set('Cookie', user.cookie);
  expect(skins.status).toBe(200);
  const activeCount = (skins.body.skins as { state: string }[]).filter(
    (skin) => skin.state === 'ACTIVE',
  ).length;
  expect(activeCount).toBe(0);

  // And the owner cannot quietly re-enable it.
  const reactivate = await ctx
    .request()
    .post(`/api/user/textures/${textureId}/activate`)
    .set('Cookie', user.cookie)
    .send();
  expect(reactivate.status).toBe(400);
});
