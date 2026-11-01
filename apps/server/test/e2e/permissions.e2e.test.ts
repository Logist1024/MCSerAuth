import { beforeAll, afterAll, expect, test, vi } from 'vitest';
import { ErrorCode } from '@mcserauth/shared';

vi.setConfig({ testTimeout: 60_000 });

import {
  createE2eContext,
  promoteToRole,
  registerVerifiedUser,
  type Actor,
  type E2eContext,
} from '../helpers/e2e.js';

// Chain 5 (guide §5.2, closes F3.4): the permission matrix over HTTP —
// four roles, the users.ban capability downgrade, and banned accounts
// being locked out of both admin endpoints and the writable forum.

let ctx: E2eContext;
let nobody: Actor;
let reviewer: Actor;
let superadmin: Actor;
let target: Actor;

beforeAll(async () => {
  ctx = await createE2eContext();
  nobody = await registerVerifiedUser(ctx);
  reviewer = await registerVerifiedUser(ctx);
  superadmin = await registerVerifiedUser(ctx);
  target = await registerVerifiedUser(ctx);
  await promoteToRole(ctx, reviewer, 'reviewer');
  await promoteToRole(ctx, superadmin, 'superadmin');
});

afterAll(async () => {
  await ctx.close();
});

test('a plain user cannot even list pending reports', async () => {
  const denied = await ctx.request().get('/api/admin/forum/reports').set('Cookie', nobody.cookie);
  expect(denied.status).toBe(403);
  expect(denied.body.code).toBe(ErrorCode.FORBIDDEN);
});

test('a reviewer reads reports but cannot ban without the capability', async () => {
  const reports = await ctx
    .request()
    .get('/api/admin/forum/reports')
    .set('Cookie', reviewer.cookie);
  expect(reports.status).toBe(200);

  const denied = await ctx
    .request()
    .post(`/api/admin/forum/users/${target.userId}/ban`)
    .set('Cookie', reviewer.cookie)
    .send({ reason: 'e2e', banGame: true });
  expect(denied.status).toBe(403);
  expect(denied.body.code).toBe(ErrorCode.FORBIDDEN);
});

test('the superadmin grants users.ban and the reviewer can ban', async () => {
  const grant = await ctx
    .request()
    .put(`/api/admin/site/permissions/${reviewer.userId}`)
    .set('Cookie', superadmin.cookie)
    .send({ permissions: ['users.ban'] });
  expect(grant.status).toBeLessThan(300);
  expect(grant.body.data.permissions).toEqual(['users.ban']);

  // The grant endpoint itself stays superadmin-only.
  const selfGrant = await ctx
    .request()
    .put(`/api/admin/site/permissions/${nobody.userId}`)
    .set('Cookie', reviewer.cookie)
    .send({ permissions: ['users.ban'] });
  expect(selfGrant.status).toBe(403);

  const ban = await ctx
    .request()
    .post(`/api/admin/forum/users/${target.userId}/ban`)
    .set('Cookie', reviewer.cookie)
    .send({ reason: 'e2e 能力下放封禁', banGame: true, banForum: true });
  expect(ban.status).toBeLessThan(300);
});

test('the banned account is locked out of the forum and admin alike', async () => {
  const post = await ctx
    .request()
    .post('/api/forum/posts')
    .set('Cookie', target.cookie)
    .send({ categoryId: 1, title: '被封禁后发帖', contentMd: '不应成功' });
  expect(post.status).toBe(403);
  expect(post.body.code).toBe(ErrorCode.FORBIDDEN);

  const adminProbe = await ctx
    .request()
    .get('/api/admin/forum/reports')
    .set('Cookie', target.cookie);
  expect(adminProbe.status).toBe(403);
});
