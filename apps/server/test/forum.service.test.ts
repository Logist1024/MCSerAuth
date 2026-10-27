import { NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
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

  beforeEach(() => {
    ctx = createTestContext();
    ctx.db.db
      .insert(user)
      .values([
        { id: 'u1', email: 'u1@example.com', name: 'User One' },
        { id: 'u2', email: 'u2@example.com', name: 'User Two' },
      ])
      .run();
    ctx.db.db
      .insert(player)
      .values([
        { uuid: UUID_1, userId: 'u1', nickname: 'PlayerOne' },
        { uuid: UUID_2, userId: 'u2', nickname: 'PlayerTwo' },
      ])
      .run();
    const board = ctx.db.db
      .insert(category)
      .values({ name: 'General', slug: 'general' })
      .returning()
      .get();
    postId = ctx.db.db
      .insert(post)
      .values({ categoryId: board.id, authorId: 'u1', title: 'Hello world', contentMd: 'body' })
      .returning()
      .get().id;

    for (let floor = 1; floor <= 5; floor += 1) {
      const inserted = ctx.db.db
        .insert(reply)
        .values({ postId, authorId: 'u1', contentMd: `reply ${floor}`, floor })
        .returning()
        .get();
      replyId = inserted.id;
    }

    forum = new ForumService(
      ctx.db,
      new NotificationsService(ctx.db),
      new ForumCategoryService(ctx.db),
      new ProgressService(ctx.db),
    );
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('paginates replies and reports a viewer-visible total', () => {
    const detail = forum.getPost(postId, null, { replyPage: 2, replyPageSize: 2 });

    expect(detail.replyTotal).toBe(5);
    expect(detail.replyPage).toBe(2);
    expect(detail.replyPageSize).toBe(2);
    expect(detail.replies.map((item) => item.floor)).toEqual([3, 4]);
    expect(detail.replyCount).toBe(5);
  });

  it('hides non-published posts from anonymous viewers', () => {
    ctx.db.db.update(postTable).set({ status: 'hidden' }).where(eqId(postId)).run();

    expect(() => forum.getPost(postId, null)).toThrow(NotFoundException);
  });

  it('freezes replies of a hidden post for non-moderators', () => {
    ctx.db.db.update(post).set({ status: 'hidden' }).where(eqId(postId)).run();
    const voter = ctx.db.db.select().from(user).where(eqUserId('u2')).get();
    if (voter === undefined) {
      throw new Error('missing voter');
    }

    expect(() => forum.toggleVote(voter, 'reply', replyId)).toThrow(/不可点赞/);
  });

  it('toggles votes and aggregates child-category counts', () => {
    const voter = ctx.db.db.select().from(user).where(eqUserId('u2')).get();
    if (voter === undefined) {
      throw new Error('missing voter');
    }

    const liked = forum.toggleVote(voter, 'reply', replyId);
    expect(liked).toMatchObject({ voted: true, voteCount: 1 });
    const unliked = forum.toggleVote(voter, 'reply', replyId);
    expect(unliked).toMatchObject({ voted: false, voteCount: 0 });

    const parent = ctx.db.db
      .insert(category)
      .values({ name: 'Parent', slug: 'parent' })
      .returning()
      .get();
    const child = ctx.db.db
      .insert(category)
      .values({ name: 'Child', slug: 'child', parentId: parent.id })
      .returning()
      .get();
    ctx.db.db
      .insert(post)
      .values({
        categoryId: parent.id,
        authorId: 'u1',
        title: 'Parent post',
        contentMd: 'p',
      })
      .run();
    ctx.db.db
      .insert(post)
      .values({ categoryId: child.id, authorId: 'u1', title: 'Child post', contentMd: 'c' })
      .run();

    const tree = forum.listCategories();
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
