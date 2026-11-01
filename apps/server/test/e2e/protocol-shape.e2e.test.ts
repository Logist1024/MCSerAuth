import { beforeAll, afterAll, expect, test, vi } from 'vitest';

vi.setConfig({ testTimeout: 60_000 });

import {
  createE2eContext,
  registerVerifiedUser,
  type Actor,
  type E2eContext,
} from '../helpers/e2e.js';

// Chain 6 (guide §5.2, closes T8/F11's error-shape half): the three response
// dialects this server speaks must never bleed into each other —
//   1. envelope endpoints: {code, message} / {code: 0, data},
//   2. protocol endpoints: {error, errorMessage},
//   3. better-auth routes: their own native error body, outside the envelope.
// Also pins the express-level credential rate limit for real (429).

let ctx: E2eContext;
let user: Actor;

beforeAll(async () => {
  ctx = await createE2eContext();
  user = await registerVerifiedUser(ctx);
});

afterAll(async () => {
  await ctx.close();
});

test('health probes live outside the /api prefix', async () => {
  const direct = await ctx.request().get('/health/live');
  expect(direct.status).toBe(200);

  const prefixed = await ctx.request().get('/api/health/live');
  expect(prefixed.status).toBe(404);
});

test('validation failures on envelope endpoints speak {code, message}', async () => {
  const bad = await ctx
    .request()
    .post('/api/forum/reports')
    .set('Cookie', user.cookie)
    .send({ targetType: 'post', targetId: '1', reason: '短' });
  expect(bad.status).toBe(400);
  expect(bad.body.code).toBe(10001);
  expect(bad.body.error).toBeUndefined();
  expect(bad.body.data).toBeUndefined();
});

test('protocol endpoints speak {error, errorMessage} even for validation', async () => {
  const bad = await ctx.request().post('/api/authserver/authenticate').send({});
  expect(bad.status).toBe(400);
  expect(bad.body.error).toBe('IllegalArgumentException');
  expect(typeof bad.body.errorMessage).toBe('string');
  expect(bad.body.code).toBeUndefined();
});

test('better-auth answers with its own body, not the Nest envelope', async () => {
  const bad = await ctx
    .request()
    .post('/api/auth/sign-in/email')
    .set('X-Forwarded-For', '10.90.0.1')
    .send({ email: user.email, password: 'wrong-password-123' });
  expect(bad.status).toBe(401);
  // better-auth error shape: a message (and its own string code), never the
  // numeric envelope code nor the protocol error field.
  expect(bad.body.code).not.toBe(0);
  expect(bad.body.error).toBeUndefined();
  expect(bad.body.data).toBeUndefined();
});

test('the CSP policy switches per request: strict nonce for pages, relaxed for swagger', async () => {
  const entry = await ctx.request().get('/api/oauth/entry');
  const entryCsp = entry.headers['content-security-policy'];
  expect(entryCsp).toContain('nonce-');
  expect(entryCsp).not.toContain("'unsafe-inline'");

  const docs = await ctx.request().get('/docs');
  expect(docs.status).toBe(200);
  expect(docs.headers['content-security-policy']).toContain("'unsafe-inline'");
});

test('the credential limiter 429s the 11th sign-in from one address', async () => {
  // One bucket = one X-Forwarded-For; 10 allowed per minute, then 429 with
  // the plain JSON the express limiter writes (still not an envelope).
  let last;
  for (let attempt = 0; attempt < 11; attempt += 1) {
    last = await ctx
      .request()
      .post('/api/auth/sign-in/email')
      .set('X-Forwarded-For', '10.91.7.7')
      .send({ email: 'ratelimited@test.local', password: 'whatever-password' });
  }
  expect(last?.status).toBe(429);
  expect(last?.body).toEqual({ message: '请求过于频繁，请稍后再试' });
});
