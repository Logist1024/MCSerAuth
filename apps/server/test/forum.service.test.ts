import { NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { firstOrThrow } from '../src/common/helpers/rows.js';
import { NotificationsService } from '../src/modules/forum/notifications.service.js';
import { ForumCategoryService } from '../src/modules/forum/forum-category.service.js';
import { ForumService } from '../src/modules/forum/forum.service.js';
import { createProgressService } from './helpers/growth.js';
import {
  category,
  player,
  post as postTable,
  post,
  reply,
  user as userTable,
  user,
  vote,
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
      createProgressService(ctx.db),
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

  describe('listPosts sort & search', () => {
    /** 把 fixture 里的基准帖挪到过去，便于插入可确定排序的新帖。 */
    async function ageBasePost(): Promise<void> {
      await ctx.db.db
        .update(post)
        .set({
          createdAt: new Date('2020-01-01T00:00:00Z'),
          lastActivityAt: new Date('2020-01-01T00:00:00Z'),
        })
        .where(eqId(postId));
    }
    async function boardId(): Promise<number> {
      return firstOrThrow(
        await ctx.db.db.select().from(category).where(eq(category.slug, 'general')),
      ).id;
    }
    it('sorts by creation time with sort=created', async () => {
      await ageBasePost();
      await ctx.db.db.insert(post).values({
        categoryId: await boardId(),
        authorId: 'u1',
        title: 'Newer post',
        contentMd: 'x',
        createdAt: new Date('2026-06-01T00:00:00Z'),
        lastActivityAt: new Date('2026-06-01T00:00:00Z'),
      });
      const list = await forum.listPosts({ sort: 'created' });
      expect(list.items[0]?.title).toBe('Newer post');
    });
    it('sorts hot by reply count plus vote count, pinned first', async () => {
      const hotId = firstOrThrow(
        await ctx.db.insertReturning(post, {
          categoryId: await boardId(),
          authorId: 'u1',
          title: 'Hot post',
          contentMd: 'x',
          createdAt: new Date('2020-06-01T00:00:00Z'),
          lastActivityAt: new Date('2020-06-01T00:00:00Z'),
        }),
      ).id;
      // base 帖 5 条回复 0 赞 = 5 分；hot 帖 4 回复 2 赞 = 6 分。
      await ctx.db.db.insert(reply).values(
        [1, 2, 3, 4].map((floor) => ({
          postId: hotId,
          authorId: 'u1',
          contentMd: `r${floor}`,
          floor,
        })),
      );
      await ctx.db.db
        .insert(vote)
        .values(
          ['u1', 'u2'].map((userId) => ({ userId, targetType: 'post' as const, targetId: hotId })),
        );
      const list = await forum.listPosts({ sort: 'hot' });
      expect(list.items.map((item) => item.title)).toEqual(['Hot post', 'Hello world']);
      // activity 排序仍按最后活动时间（基准帖更新，hot 帖更旧）。
      const byActivity = await forum.listPosts({});
      expect(byActivity.items[0]?.title).toBe('Hello world');
    });
    it('pins posts above all sort modes', async () => {
      await ageBasePost();
      const board = await boardId();
      await ctx.db.db.insert(post).values({
        categoryId: board,
        authorId: 'u1',
        title: 'Pinned old post',
        contentMd: 'x',
        pinned: true,
        createdAt: new Date('2019-01-01T00:00:00Z'),
        lastActivityAt: new Date('2019-01-01T00:00:00Z'),
      });
      const list = await forum.listPosts({ sort: 'created' });
      expect(list.items[0]?.title).toBe('Pinned old post');
    });
    it('searches titles case-insensitively and combines with category filter', async () => {
      const board = await boardId();
      const other = firstOrThrow(
        await ctx.db.insertReturning(category, { name: 'Other', slug: 'other' }),
      );
      await ctx.db.db.insert(post).values([
        { categoryId: other.id, authorId: 'u1', title: 'Hello again', contentMd: 'x' },
        { categoryId: board, authorId: 'u1', title: '100% 攻略', contentMd: 'x' },
      ]);
      expect(
        (await forum.listPosts({ search: 'HELLO' })).items.map((item) => item.title).sort(),
      ).toEqual(['Hello again', 'Hello world']);
      expect(
        (await forum.listPosts({ search: 'hello', categorySlug: 'general' })).items.map(
          (item) => item.title,
        ),
      ).toEqual(['Hello world']);
      // 通配符被转义：字面 "%" 只匹配标题含 % 的帖子，"_" 不再充当任意单字符。
      expect((await forum.listPosts({ search: '%' })).items.map((item) => item.title)).toEqual([
        '100% 攻略',
      ]);
      expect((await forum.listPosts({ search: '_' })).items).toEqual([]);
      expect((await forum.listPosts({ search: '100%' })).items.map((item) => item.title)).toEqual([
        '100% 攻略',
      ]);
    });
  });
});
function eqId(id: number) {
  return eq(postTable.id, id);
}
function eqUserId(id: string) {
  return eq(userTable.id, id);
}
