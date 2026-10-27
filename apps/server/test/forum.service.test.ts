import { NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { firstOrThrow } from '../src/common/helpers/rows.js';
import { NotificationsService } from '../src/modules/forum/notifications.service.js';
import { ForumCategoryService } from '../src/modules/forum/forum-category.service.js';
import { ForumService } from '../src/modules/forum/forum.service.js';
import { ProgressService } from '../src/modules/growth/progress.service.js';
import {
  category,
  player,
  post as postTable,
  post,
  reply,
  user as userTable,
  user,
} from '../src/db/schema/index.js';
import { createTestContext, type TestContext } from './helpers/db.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
const UUID_1 = 'a'.repeat(32);
const UUID_2 = 'b'.repeat(32);
describe('ForumService', () => {
  let ctx: TestContext;
  let forum: ForumService;
  let postId: number;
  let replyId = 0;
  beforeEach(async () => {
    ctx = await createTestContext();
    await ctx.db.db.insert(user).values([
      { id: 'u1', email: 'u1@example.com', name: 'User One' },
      { id: 'u2', email: 'u2@example.com', name: 'User Two' },
    ]);
    await ctx.db.db.insert(player).values([
      { uuid: UUID_1, userId: 'u1', nickname: 'PlayerOne' },
      { uuid: UUID_2, userId: 'u2', nickname: 'PlayerTwo' },
    ]);
    const board = firstOrThrow(
      await ctx.db.insertReturning(category, { name: 'General', slug: 'general' }),
    );
    postId = firstOrThrow(
      await ctx.db.insertReturning(post, {
        categoryId: board.id,
        authorId: 'u1',
        title: 'Hello world',
        contentMd: 'body',
      }),
    ).id;
    for (let floor = 1; floor <= 5; floor += 1) {
      const inserted = firstOrThrow(
        await ctx.db.insertReturning(reply, {
          postId,
          authorId: 'u1',
          contentMd: `reply ${floor}`,
          floor,
        }),
      );
      replyId = inserted.id;
    }
    forum = new ForumService(
      ctx.db,
      new NotificationsService(ctx.db),
      new ForumCategoryService(ctx.db),
      new ProgressService(ctx.db),
    );
  });
  afterEach(async () => {
    await ctx.cleanup();
  });
  it('paginates replies and reports a viewer-visible total', async () => {
    const detail = await forum.getPost(postId, null, { replyPage: 2, replyPageSize: 2 });
    expect(detail.replyTotal).toBe(5);
    expect(detail.replyPage).toBe(2);
    expect(detail.replyPageSize).toBe(2);
    expect(detail.replies.map((item) => item.floor)).toEqual([3, 4]);
    expect(detail.replyCount).toBe(5);
  });
  it('hides non-published posts from anonymous viewers', async () => {
    await ctx.db.db.update(postTable).set({ status: 'hidden' }).where(eqId(postId));
    await expect(forum.getPost(postId, null)).rejects.toThrow(NotFoundException);
  });
  it('freezes replies of a hidden post for non-moderators', async () => {
    await ctx.db.db.update(post).set({ status: 'hidden' }).where(eqId(postId));
    const voter = (await ctx.db.db.select().from(user).where(eqUserId('u2')))[0];
    if (voter === undefined) {
      throw new Error('missing voter');
    }
    await expect(forum.toggleVote(voter, 'reply', replyId)).rejects.toThrow(/不可点赞/);
  });
  it('toggles votes and aggregates child-category counts', async () => {
    const voter = (await ctx.db.db.select().from(user).where(eqUserId('u2')))[0];
    if (voter === undefined) {
      throw new Error('missing voter');
    }
    const liked = await forum.toggleVote(voter, 'reply', replyId);
    expect(liked).toMatchObject({ voted: true, voteCount: 1 });
    const unliked = await forum.toggleVote(voter, 'reply', replyId);
    expect(unliked).toMatchObject({ voted: false, voteCount: 0 });
    const parent = firstOrThrow(
      await ctx.db.insertReturning(category, { name: 'Parent', slug: 'parent' }),
    );
    const child = firstOrThrow(
      await ctx.db.insertReturning(category, {
        name: 'Child',
        slug: 'child',
        parentId: parent.id,
      }),
    );
    await ctx.db.db.insert(post).values({
      categoryId: parent.id,
      authorId: 'u1',
      title: 'Parent post',
      contentMd: 'p',
    });
    await ctx.db.db
      .insert(post)
      .values({ categoryId: child.id, authorId: 'u1', title: 'Child post', contentMd: 'c' });
    const tree = await forum.listCategories();
    expect(tree.find((node) => node.id === parent.id)?.postCount).toBe(2);
    expect(tree.find((node) => node.id === parent.id)?.children[0]?.postCount).toBe(1);
  });
});
function eqId(id: number) {
  return eq(postTable.id, id);
}
function eqUserId(id: string) {
  return eq(userTable.id, id);
}
