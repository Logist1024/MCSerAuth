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

// Chain 1 (guide §5.2): the forum trunk — sign up → post → reply → vote →
// report → reviewer moderation, all over real HTTP against the production
// middleware assembly. Also pins the envelope shape on the way.

let ctx: E2eContext;
let superadmin: Actor;
let author: Actor;
let replier: Actor;
let reviewer: Actor;
let categoryId: number;
let postId: number;

beforeAll(async () => {
  ctx = await createE2eContext();
  superadmin = await registerVerifiedUser(ctx);
  author = await registerVerifiedUser(ctx);
  replier = await registerVerifiedUser(ctx);
  reviewer = await registerVerifiedUser(ctx);
  await promoteToRole(ctx, superadmin, 'superadmin');
  await promoteToRole(ctx, reviewer, 'reviewer');

  const created = await ctx
    .request()
    .post('/api/admin/forum/categories')
    .set('Cookie', superadmin.cookie)
    .send({ name: 'E2E 主干版块', slug: 'e2e-trunk', description: '论坛主干链路专用' });
  expect(created.status).toBeLessThan(300);
  categoryId = created.body.data.id;
});

afterAll(async () => {
  await ctx.close();
});

test('an anonymous user is rejected with the envelope 401', async () => {
  const response = await ctx
    .request()
    .post('/api/forum/posts')
    .send({ categoryId, title: '匿名发帖', contentMd: '不应成功' });
  expect(response.status).toBe(401);
  expect(response.body).toMatchObject({ code: ErrorCode.UNAUTHORIZED });
});

test('the author publishes a post and the replier answers', async () => {
  const post = await ctx
    .request()
    .post('/api/forum/posts')
    .set('Cookie', author.cookie)
    .send({ categoryId, title: 'E2E 主干帖', contentMd: '第一条 e2e 帖子正文' });
  expect(post.status).toBe(201);
  expect(post.body.code).toBe(0);
  expect(post.body.data.status).toBe('published');
  postId = post.body.data.id;

  const reply = await ctx
    .request()
    .post(`/api/forum/posts/${postId}/replies`)
    .set('Cookie', replier.cookie)
    .send({ contentMd: '第一条 e2e 回复' });
  expect(reply.status).toBe(201);
  expect(reply.body.data.postId).toBe(postId);
});

test('mentions in a new post notify the mentioned account', async () => {
  const mentionPost = await ctx
    .request()
    .post('/api/forum/posts')
    .set('Cookie', author.cookie)
    .send({
      categoryId,
      title: 'E2E 提及通知',
      contentMd: `@${replier.name} 请看一下这个主题`,
    });
  expect(mentionPost.status).toBe(201);

  const notifications = await ctx
    .request()
    .get('/api/forum/notifications?type=mention')
    .set('Cookie', replier.cookie);
  expect(notifications.status).toBe(200);
  expect(
    notifications.body.data.items.some(
      (item: { link: string | null }) => item.link === `/forum/post/${mentionPost.body.data.id}`,
    ),
  ).toBe(true);
});

test('voting toggles', async () => {
  const first = await ctx
    .request()
    .post(`/api/forum/posts/${postId}/vote`)
    .set('Cookie', replier.cookie)
    .send();
  expect(first.status).toBeLessThan(300);
  expect(first.body.data).toMatchObject({ voted: true, voteCount: 1 });

  const second = await ctx
    .request()
    .post(`/api/forum/posts/${postId}/vote`)
    .set('Cookie', replier.cookie)
    .send();
  expect(second.body.data).toMatchObject({ voted: false, voteCount: 0 });
});

test('the post list supports sort and title search', async () => {
  const alpha = await ctx
    .request()
    .post('/api/forum/posts')
    .set('Cookie', author.cookie)
    .send({ categoryId, title: '排序搜索 Alpha', contentMd: 'alpha' });
  expect(alpha.status).toBe(201);
  const beta = await ctx
    .request()
    .post('/api/forum/posts')
    .set('Cookie', author.cookie)
    .send({ categoryId, title: '排序搜索 Beta', contentMd: 'beta' });
  expect(beta.status).toBe(201);

  // Alpha 收到回复（最新活动），Beta 更新（最新发布）并拿到 2 票（最热）。
  // 等待跨过时间戳精度（sqlite 秒级），保证排序断言确定性。
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await ctx
    .request()
    .post(`/api/forum/posts/${alpha.body.data.id}/replies`)
    .set('Cookie', replier.cookie)
    .send({ contentMd: '让 Alpha 变成最新活动' });
  for (const actor of [replier, reviewer]) {
    await ctx
      .request()
      .post(`/api/forum/posts/${beta.body.data.id}/vote`)
      .set('Cookie', actor.cookie)
      .send();
  }

  const byActivity = await ctx.request().get('/api/forum/posts').query({ sort: 'activity' });
  expect(byActivity.status).toBe(200);
  expect(byActivity.body.data.items[0].title).toBe('排序搜索 Alpha');

  const byCreated = await ctx.request().get('/api/forum/posts').query({ sort: 'created' });
  expect(byCreated.body.data.items[0].title).toBe('排序搜索 Beta');

  const byHot = await ctx.request().get('/api/forum/posts').query({ sort: 'hot' });
  expect(byHot.body.data.items[0].title).toBe('排序搜索 Beta');

  const searched = await ctx.request().get('/api/forum/posts').query({ search: '排序搜索' });
  const titles = searched.body.data.items.map((item: { title: string }) => item.title);
  expect(titles).toContain('排序搜索 Alpha');
  expect(titles).toContain('排序搜索 Beta');

  const scoped = await ctx
    .request()
    .get('/api/forum/posts')
    .query({ search: '主干', categorySlug: 'e2e-trunk' });
  expect(scoped.body.data.items.map((item: { title: string }) => item.title)).toEqual([
    'E2E 主干帖',
  ]);

  const invalid = await ctx.request().get('/api/forum/posts').query({ sort: 'bogus' });
  expect(invalid.status).toBe(400);
  expect(invalid.body.code).toBe(ErrorCode.VALIDATION_FAILED);
});

test('the report flows to the reviewer and gets resolved', async () => {
  const reported = await ctx
    .request()
    .post('/api/forum/reports')
    .set('Cookie', replier.cookie)
    .send({ targetType: 'post', targetId: String(postId), reason: 'e2e 举报：测试处置闭环' });
  expect(reported.status).toBeLessThan(300);
  expect(reported.body.data.id).toBeGreaterThan(0);

  const list = await ctx
    .request()
    .get('/api/admin/forum/reports')
    .query({ status: 'pending' })
    .set('Cookie', reviewer.cookie);
  expect(list.status).toBe(200);
  const report = list.body.data.items.find(
    (item: { id: number }) => item.id === reported.body.data.id,
  );
  expect(report).toBeDefined();

  const resolved = await ctx
    .request()
    .post(`/api/admin/forum/reports/${report.id}/resolve`)
    .set('Cookie', reviewer.cookie)
    .send({ reason: 'e2e 处置' });
  expect(resolved.status).toBeLessThan(300);
});

test('the reviewer hides the post; non-moderators cannot moderate', async () => {
  const hidden = await ctx
    .request()
    .patch(`/api/admin/forum/posts/${postId}`)
    .set('Cookie', reviewer.cookie)
    .send({ status: 'hidden', reason: 'e2e 隐藏' });
  expect(hidden.status).toBeLessThan(300);

  // Hidden posts vanish for the public but stay visible to their author.
  const anonymous = await ctx.request().get(`/api/forum/posts/${postId}`);
  expect(anonymous.status).toBe(404);

  const asAuthor = await ctx
    .request()
    .get(`/api/forum/posts/${postId}`)
    .set('Cookie', author.cookie);
  expect(asAuthor.status).toBe(200);
  expect(asAuthor.body.data.status).toBe('hidden');

  const forbidden = await ctx
    .request()
    .patch(`/api/admin/forum/posts/${postId}`)
    .set('Cookie', replier.cookie)
    .send({ status: 'published' });
  expect(forbidden.status).toBe(403);
  expect(forbidden.body.code).toBe(ErrorCode.FORBIDDEN);
});
test('notification filters are applied in SQL, not on the current page', async () => {
  const unread = await ctx
    .request()
    .get('/api/forum/notifications?status=unread')
    .set('Cookie', author.cookie);
  expect(unread.status).toBe(200);
  expect(unread.body.data.total).toBeGreaterThan(0);
  expect(unread.body.data.items.length).toBeGreaterThan(0);
  expect(
    unread.body.data.items.every((item: { readAt: string | null }) => item.readAt === null),
  ).toBe(true);

  const replies = await ctx
    .request()
    .get('/api/forum/notifications?status=unread&type=reply')
    .set('Cookie', author.cookie);
  expect(replies.body.data.items.every((item: { type: string }) => item.type === 'reply')).toBe(
    true,
  );

  const all = await ctx.request().get('/api/forum/notifications').set('Cookie', author.cookie);
  expect(all.status).toBe(200);
  expect(all.body.data.allTotal).toBe(all.body.data.total);
  expect(unread.body.data.allTotal).toBe(all.body.data.total);
  expect(replies.body.data.allTotal).toBe(all.body.data.total);

  const first = unread.body.data.items[0] as { id: number };
  const marked = await ctx
    .request()
    .post(`/api/forum/notifications/${first.id}/read`)
    .set('Cookie', author.cookie)
    .send();
  expect(marked.status).toBeLessThan(300);

  const after = await ctx
    .request()
    .get('/api/forum/notifications?status=unread')
    .set('Cookie', author.cookie);
  expect(after.body.data.total).toBe(unread.body.data.total - 1);
  expect(after.body.data.unreadCount).toBe(unread.body.data.unreadCount - 1);
});
