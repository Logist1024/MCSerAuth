import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  roleAtLeast,
  type CreateReportRequest,
  type ForumAuthor,
  type ForumCategory,
  type ForumPostDetail,
  type ForumPostSummary,
  type ForumReply,
  type ModeratePostRequest,
  type ModeratePostResponse,
  type ModerateReplyRequest,
  type ModerateReplyResponse,
  type ModerationAction,
  type Paginated,
  type ReportTargetType,
  type UserTitleSummary,
  type VoteResponse,
} from '@mcserauth/shared';
import { and, count, desc, eq, inArray, max, ne } from 'drizzle-orm';
import { DbService } from '../../db/db.service.js';
import {
  category as categoryTable,
  moderationLog,
  player as playerTable,
  post as postTable,
  reply as replyTable,
  report as reportTable,
  skin as skinTable,
  user as userTable,
  vote as voteTable,
} from '../../db/schema/index.js';
import type { AccountUser } from '../auth/account-access.service.js';
import { ProgressService } from '../growth/progress.service.js';
import { ForumCategoryService } from './forum-category.service.js';
import { excerptOf } from './forum.helpers.js';
import { NotificationsService } from './notifications.service.js';

type CategoryRow = typeof categoryTable.$inferSelect;
type PlayerRow = typeof playerTable.$inferSelect;
type PostRow = typeof postTable.$inferSelect;
type ReplyRow = typeof replyTable.$inferSelect;
type UserRow = typeof userTable.$inferSelect;

interface PostJoinRow {
  post: PostRow;
  author: UserRow;
  player: PlayerRow | null;
  category: CategoryRow;
}

interface ReplyJoinRow {
  reply: ReplyRow;
  author: UserRow;
  player: PlayerRow | null;
}

/** Forum reads, writes, votes and reports. Category logic lives in ForumCategoryService. */
@Injectable()
export class ForumService {
  constructor(
    private readonly db: DbService,
    private readonly notifications: NotificationsService,
    private readonly categories: ForumCategoryService,
    private readonly progress: ProgressService,
  ) {}

  listCategories(): ForumCategory[] {
    return this.categories.listCategories();
  }

  // ---------------------------------------------------------------------- posts

  listPosts(query: {
    categorySlug?: string;
    page?: number;
    pageSize?: number;
  }): Paginated<ForumPostSummary> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 20));

    const conditions = [eq(postTable.status, 'published')];
    if (query.categorySlug !== undefined && query.categorySlug !== '') {
      const category = this.categories.getCategoryBySlug(query.categorySlug);
      conditions.push(
        inArray(postTable.categoryId, this.categories.descendantCategoryIds(category.id)),
      );
    }

    const totalRow = this.db.db
      .select({ value: count() })
      .from(postTable)
      .where(and(...conditions))
      .get();

    const rows = this.db.db
      .select({
        post: postTable,
        author: userTable,
        player: playerTable,
        category: categoryTable,
      })
      .from(postTable)
      .innerJoin(userTable, eq(postTable.authorId, userTable.id))
      .leftJoin(playerTable, eq(playerTable.userId, userTable.id))
      .innerJoin(categoryTable, eq(postTable.categoryId, categoryTable.id))
      .where(and(...conditions))
      .orderBy(desc(postTable.pinned), desc(postTable.lastActivityAt), desc(postTable.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all();

    return {
      items: this.mapPosts(rows),
      page,
      pageSize,
      total: totalRow?.value ?? 0,
    };
  }

  recentPostsByUser(userId: string, limit = 5): ForumPostSummary[] {
    const rows = this.db.db
      .select({
        post: postTable,
        author: userTable,
        player: playerTable,
        category: categoryTable,
      })
      .from(postTable)
      .innerJoin(userTable, eq(postTable.authorId, userTable.id))
      .leftJoin(playerTable, eq(playerTable.userId, userTable.id))
      .innerJoin(categoryTable, eq(postTable.categoryId, categoryTable.id))
      .where(and(eq(postTable.status, 'published'), eq(postTable.authorId, userId)))
      .orderBy(desc(postTable.createdAt))
      .limit(limit)
      .all();
    return this.mapPosts(rows);
  }

  getPost(
    id: number,
    viewer: AccountUser | null,
    query: { replyPage?: number; replyPageSize?: number } = {},
  ): ForumPostDetail {
    const replyPage = Math.max(1, query.replyPage ?? 1);
    const replyPageSize = Math.min(50, Math.max(1, query.replyPageSize ?? 20));
    const row = this.db.db
      .select({
        post: postTable,
        author: userTable,
        player: playerTable,
        category: categoryTable,
      })
      .from(postTable)
      .innerJoin(userTable, eq(postTable.authorId, userTable.id))
      .leftJoin(playerTable, eq(playerTable.userId, userTable.id))
      .innerJoin(categoryTable, eq(postTable.categoryId, categoryTable.id))
      .where(eq(postTable.id, id))
      .get();

    if (!row || row.post.status === 'deleted') {
      throw new NotFoundException('帖子不存在');
    }
    if (
      row.post.status !== 'published' &&
      row.post.authorId !== viewer?.id &&
      !this.isModerator(viewer)
    ) {
      throw new NotFoundException('帖子不存在');
    }

    const summary = this.mapPosts([row])[0];
    if (!summary) {
      throw new NotFoundException('帖子不存在');
    }

    const replyVisibility = this.isModerator(viewer)
      ? ne(replyTable.status, 'deleted')
      : eq(replyTable.status, 'published');
    const replyTotalRow = this.db.db
      .select({ value: count() })
      .from(replyTable)
      .where(and(eq(replyTable.postId, id), replyVisibility))
      .get();
    const replyRows = this.db.db
      .select({ reply: replyTable, author: userTable, player: playerTable })
      .from(replyTable)
      .innerJoin(userTable, eq(replyTable.authorId, userTable.id))
      .leftJoin(playerTable, eq(playerTable.userId, userTable.id))
      .where(and(eq(replyTable.postId, id), replyVisibility))
      .orderBy(replyTable.floor)
      .limit(replyPageSize)
      .offset((replyPage - 1) * replyPageSize)
      .all();

    const replies = this.mapReplies(replyRows, viewer);
    const postVote = this.loadViewerVotes([id], 'post', viewer?.id).has(id);

    return {
      ...summary,
      contentMd: row.post.contentMd,
      viewerVoted: postVote,
      replies,
      replyTotal: replyTotalRow?.value ?? 0,
      replyPage,
      replyPageSize,
    };
  }

  createPost(
    author: AccountUser,
    input: { categoryId: number; title: string; contentMd: string },
  ): ForumPostDetail {
    const category = this.db.db
      .select({ id: categoryTable.id })
      .from(categoryTable)
      .where(eq(categoryTable.id, input.categoryId))
      .get();
    if (!category) {
      throw new BadRequestException('版块不存在');
    }

    const inserted = this.db.db
      .insert(postTable)
      .values({
        categoryId: input.categoryId,
        authorId: author.id,
        title: input.title.trim(),
        contentMd: input.contentMd,
        status: 'published',
      })
      .returning()
      .get();

    this.progress.awardPostXp(author.id);

    return this.getPost(inserted.id, author);
  }

  updatePost(
    actor: AccountUser,
    id: number,
    input: { title?: string; contentMd?: string },
  ): ForumPostDetail {
    const row = this.requirePost(id);
    if (row.authorId !== actor.id) {
      throw new ForbiddenException('只能编辑自己的帖子');
    }
    if (row.status === 'deleted') {
      throw new BadRequestException('帖子已删除');
    }

    this.db.db
      .update(postTable)
      .set({
        ...(input.title === undefined ? {} : { title: input.title.trim() }),
        ...(input.contentMd === undefined ? {} : { contentMd: input.contentMd }),
      })
      .where(eq(postTable.id, id))
      .run();

    return this.getPost(id, actor);
  }

  deletePost(actor: AccountUser, id: number): void {
    const row = this.requirePost(id);
    const moderator = this.isModerator(actor);
    if (row.authorId !== actor.id && !moderator) {
      throw new ForbiddenException('没有权限删除该帖子');
    }
    if (row.authorId !== actor.id) {
      this.logModeration(actor.id, 'delete_post', 'post', String(id));
      this.notifications.notifyModeration(
        row.authorId,
        '你的帖子已被版主删除',
        `/forum/post/${id}`,
      );
    }

    this.db.db.update(postTable).set({ status: 'deleted' }).where(eq(postTable.id, id)).run();
  }

  // --------------------------------------------------------------------- replies

  createReply(author: AccountUser, postId: number, contentMd: string): ForumReply {
    const post = this.requirePost(postId);
    if (post.status !== 'published') {
      throw new BadRequestException('该帖子当前不可回复');
    }
    if (post.locked && !this.isModerator(author)) {
      throw new ForbiddenException('帖子已锁定，无法回复');
    }

    const created = this.db.db.transaction((tx) => {
      const floorRow = tx
        .select({ value: max(replyTable.floor) })
        .from(replyTable)
        .where(eq(replyTable.postId, postId))
        .get();
      const inserted = tx
        .insert(replyTable)
        .values({
          postId,
          authorId: author.id,
          contentMd,
          status: 'published',
          floor: (floorRow?.value ?? 0) + 1,
        })
        .returning()
        .get();
      tx.update(postTable)
        .set({ lastActivityAt: new Date() })
        .where(eq(postTable.id, postId))
        .run();
      return inserted;
    });

    this.notifications.notifyReply(postId, post.authorId, author.id);
    this.notifications.notifyMentions(postId, contentMd, author.id);
    this.progress.awardReplyXp(author.id);

    return this.getReplyForViewer(created.id, author);
  }

  updateReply(actor: AccountUser, id: number, contentMd: string): ForumReply {
    const row = this.requireReply(id);
    if (row.authorId !== actor.id) {
      throw new ForbiddenException('只能编辑自己的回复');
    }
    if (row.status !== 'published') {
      throw new BadRequestException('该回复当前不可编辑');
    }
    this.assertParentPostOperable(row.postId, actor, '该帖子当前不可编辑回复');
    this.db.db.update(replyTable).set({ contentMd }).where(eq(replyTable.id, id)).run();
    return this.getReplyForViewer(id, actor);
  }

  deleteReply(actor: AccountUser, id: number): void {
    const row = this.requireReply(id);
    const moderator = this.isModerator(actor);
    if (row.authorId !== actor.id && !moderator) {
      throw new ForbiddenException('没有权限删除该回复');
    }
    if (row.authorId !== actor.id) {
      this.logModeration(actor.id, 'delete_reply', 'reply', String(id));
      this.notifications.notifyModeration(
        row.authorId,
        '你的回复已被版主删除',
        `/forum/post/${row.postId}`,
      );
    }
    this.db.db.update(replyTable).set({ status: 'deleted' }).where(eq(replyTable.id, id)).run();
  }

  // ----------------------------------------------------------------------- votes

  toggleVote(actor: AccountUser, targetType: 'post' | 'reply', targetId: number): VoteResponse {
    if (targetType === 'post') {
      const target = this.requirePost(targetId);
      if (target.status !== 'published') {
        throw new BadRequestException('该帖子当前不可点赞');
      }
      if (target.authorId === actor.id) {
        throw new BadRequestException('不能给自己的帖子点赞');
      }
    } else {
      const target = this.requireReply(targetId);
      if (target.status !== 'published') {
        throw new BadRequestException('该回复当前不可点赞');
      }
      this.assertParentPostOperable(target.postId, actor, '该帖子当前不可点赞');
      if (target.authorId === actor.id) {
        throw new BadRequestException('不能给自己的回复点赞');
      }
    }

    const existing = this.db.db
      .select({ id: voteTable.id })
      .from(voteTable)
      .where(
        and(
          eq(voteTable.userId, actor.id),
          eq(voteTable.targetType, targetType),
          eq(voteTable.targetId, targetId),
        ),
      )
      .get();

    if (existing) {
      this.db.db.delete(voteTable).where(eq(voteTable.id, existing.id)).run();
    } else {
      this.db.db
        .insert(voteTable)
        .values({ userId: actor.id, targetType, targetId })
        .onConflictDoNothing()
        .run();
    }

    const total = this.db.db
      .select({ value: count() })
      .from(voteTable)
      .where(and(eq(voteTable.targetType, targetType), eq(voteTable.targetId, targetId)))
      .get();

    return {
      targetType,
      targetId,
      voted: existing === undefined,
      voteCount: total?.value ?? 0,
    };
  }

  // --------------------------------------------------------------------- reports

  createReport(actor: AccountUser, input: CreateReportRequest): { id: number } {
    const reason = input.reason.trim();
    if (reason.length < 5) {
      throw new BadRequestException('举报理由至少 5 个字符');
    }
    this.assertReportTarget(actor, input.targetType, input.targetId);

    const duplicate = this.db.db
      .select({ id: reportTable.id })
      .from(reportTable)
      .where(
        and(
          eq(reportTable.reporterId, actor.id),
          eq(reportTable.targetType, input.targetType),
          eq(reportTable.targetId, input.targetId),
          eq(reportTable.status, 'pending'),
        ),
      )
      .get();
    if (duplicate) {
      throw new ConflictException('你已举报过该对象，等待处理中');
    }

    const inserted = this.db.db
      .insert(reportTable)
      .values({
        reporterId: actor.id,
        targetType: input.targetType,
        targetId: input.targetId,
        reason,
      })
      .returning({ id: reportTable.id })
      .get();

    return { id: inserted.id };
  }

  private assertReportTarget(
    actor: AccountUser,
    targetType: ReportTargetType,
    targetId: string,
  ): void {
    if (targetType === 'post' || targetType === 'reply' || targetType === 'skin') {
      const numeric = Number(targetId);
      if (!Number.isInteger(numeric) || numeric <= 0) {
        throw new BadRequestException('targetId 必须为正整数');
      }
      if (targetType === 'post') {
        const target = this.requirePost(numeric);
        if (target.status !== 'published') {
          throw new BadRequestException('该帖子当前不可举报');
        }
        if (target.authorId === actor.id) {
          throw new BadRequestException('不能举报自己的内容');
        }
        return;
      }
      if (targetType === 'reply') {
        const target = this.requireReply(numeric);
        if (target.status !== 'published') {
          throw new BadRequestException('该回复当前不可举报');
        }
        this.assertParentPostOperable(target.postId, actor, '该帖子当前不可举报');
        if (target.authorId === actor.id) {
          throw new BadRequestException('不能举报自己的内容');
        }
        return;
      }
      const skin = this.db.db
        .select({ id: skinTable.id })
        .from(skinTable)
        .where(eq(skinTable.id, numeric))
        .get();
      if (!skin) {
        throw new NotFoundException('纹理不存在');
      }
      return;
    }

    if (targetId === actor.id) {
      throw new BadRequestException('不能举报自己');
    }
    const targetUser = this.db.db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.id, targetId))
      .get();
    if (!targetUser) {
      throw new NotFoundException('用户不存在');
    }
  }

  // ------------------------------------------------------------------ moderation

  moderatePost(actor: AccountUser, id: number, input: ModeratePostRequest): ModeratePostResponse {
    const row = this.requirePost(id);
    const changes: Partial<PostRow> = {};
    const actions: ModerationAction[] = [];

    if (input.status !== undefined && input.status !== row.status) {
      changes.status = input.status;
      if (input.status === 'hidden') {
        actions.push('hide_post');
        if (row.authorId !== actor.id) {
          this.notifications.notifyModeration(
            row.authorId,
            '你的帖子已被版主隐藏',
            `/forum/post/${id}`,
          );
        }
      } else if (input.status === 'published') {
        actions.push('restore_post');
      } else if (input.status === 'deleted') {
        actions.push('delete_post');
        if (row.authorId !== actor.id) {
          this.notifications.notifyModeration(
            row.authorId,
            '你的帖子已被版主删除',
            `/forum/post/${id}`,
          );
        }
      }
    }
    if (input.pinned !== undefined && input.pinned !== row.pinned) {
      changes.pinned = input.pinned;
      actions.push(input.pinned ? 'pin_post' : 'unpin_post');
    }
    if (input.featured !== undefined && input.featured !== row.featured) {
      changes.featured = input.featured;
      actions.push(input.featured ? 'feature_post' : 'unfeature_post');
    }
    if (input.locked !== undefined && input.locked !== row.locked) {
      changes.locked = input.locked;
      actions.push(input.locked ? 'lock_post' : 'unlock_post');
    }

    if (Object.keys(changes).length === 0) {
      throw new BadRequestException('没有需要更新的字段');
    }

    const updated = this.db.db
      .update(postTable)
      .set(changes)
      .where(eq(postTable.id, id))
      .returning()
      .get();

    for (const action of actions) {
      this.logModeration(actor.id, action, 'post', String(id), input.reason);
    }

    return {
      id: updated.id,
      status: updated.status,
      pinned: updated.pinned,
      featured: updated.featured,
      locked: updated.locked,
    };
  }

  moderateReply(
    actor: AccountUser,
    id: number,
    input: ModerateReplyRequest,
  ): ModerateReplyResponse {
    const row = this.requireReply(id);
    if (input.status === undefined || input.status === row.status) {
      throw new BadRequestException('没有需要更新的字段');
    }

    const updated = this.db.db
      .update(replyTable)
      .set({ status: input.status })
      .where(eq(replyTable.id, id))
      .returning()
      .get();

    const action: ModerationAction =
      input.status === 'published'
        ? 'restore_reply'
        : input.status === 'deleted'
          ? 'delete_reply'
          : 'hide_reply';
    this.logModeration(actor.id, action, 'reply', String(id), input.reason);

    if (input.status !== 'published' && row.authorId !== actor.id) {
      this.notifications.notifyModeration(
        row.authorId,
        input.status === 'deleted' ? '你的回复已被版主删除' : '你的回复已被版主隐藏',
        `/forum/post/${row.postId}`,
      );
    }

    return { id: updated.id, status: updated.status };
  }

  // --------------------------------------------------------------------- mapping

  private mapPosts(rows: PostJoinRow[]): ForumPostSummary[] {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((row) => row.post.id);
    const replyCounts = this.db.db
      .select({ postId: replyTable.postId, value: count() })
      .from(replyTable)
      .where(and(inArray(replyTable.postId, ids), eq(replyTable.status, 'published')))
      .groupBy(replyTable.postId)
      .all();
    const voteCounts = this.db.db
      .select({ targetId: voteTable.targetId, value: count() })
      .from(voteTable)
      .where(and(eq(voteTable.targetType, 'post'), inArray(voteTable.targetId, ids)))
      .groupBy(voteTable.targetId)
      .all();

    const replyMap = new Map(replyCounts.map((row) => [row.postId, row.value]));
    const voteMap = new Map(voteCounts.map((row) => [row.targetId, row.value]));
    const badges = this.progress.badgesFor(rows.map((row) => row.author.id));

    return rows.map(({ post, author, player, category }) => ({
      id: post.id,
      title: post.title,
      excerpt: excerptOf(post.contentMd),
      category: { id: category.id, name: category.name, slug: category.slug },
      author: toAuthor(author, player, badges.get(author.id)),
      status: post.status,
      pinned: post.pinned,
      featured: post.featured,
      locked: post.locked,
      voteCount: voteMap.get(post.id) ?? 0,
      replyCount: replyMap.get(post.id) ?? 0,
      createdAt: post.createdAt.toISOString(),
      lastActivityAt: post.lastActivityAt.toISOString(),
    }));
  }

  private mapReplies(rows: ReplyJoinRow[], viewer: AccountUser | null): ForumReply[] {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((row) => row.reply.id);
    const voteCounts = this.db.db
      .select({ targetId: voteTable.targetId, value: count() })
      .from(voteTable)
      .where(and(eq(voteTable.targetType, 'reply'), inArray(voteTable.targetId, ids)))
      .groupBy(voteTable.targetId)
      .all();
    const voteMap = new Map(voteCounts.map((row) => [row.targetId, row.value]));
    const viewerVotes = this.loadViewerVotes(ids, 'reply', viewer?.id);
    const badges = this.progress.badgesFor(rows.map((row) => row.author.id));

    return rows.map(({ reply, author, player }) => ({
      id: reply.id,
      postId: reply.postId,
      floor: reply.floor,
      contentMd: reply.contentMd,
      author: toAuthor(author, player, badges.get(author.id)),
      status: reply.status,
      voteCount: voteMap.get(reply.id) ?? 0,
      viewerVoted: viewerVotes.has(reply.id),
      createdAt: reply.createdAt.toISOString(),
    }));
  }

  private getReplyForViewer(id: number, viewer: AccountUser): ForumReply {
    const row = this.db.db
      .select({ reply: replyTable, author: userTable, player: playerTable })
      .from(replyTable)
      .innerJoin(userTable, eq(replyTable.authorId, userTable.id))
      .leftJoin(playerTable, eq(playerTable.userId, userTable.id))
      .where(eq(replyTable.id, id))
      .get();
    if (!row) {
      throw new NotFoundException('回复不存在');
    }
    const mapped = this.mapReplies([row], viewer)[0];
    if (!mapped) {
      throw new NotFoundException('回复不存在');
    }
    return mapped;
  }

  private loadViewerVotes(
    targetIds: number[],
    targetType: 'post' | 'reply',
    viewerId: string | undefined,
  ): Set<number> {
    if (viewerId === undefined || targetIds.length === 0) {
      return new Set();
    }
    const rows = this.db.db
      .select({ targetId: voteTable.targetId })
      .from(voteTable)
      .where(
        and(
          eq(voteTable.userId, viewerId),
          eq(voteTable.targetType, targetType),
          inArray(voteTable.targetId, targetIds),
        ),
      )
      .all();
    return new Set(rows.map((row) => row.targetId));
  }

  private requirePost(id: number): PostRow {
    const row = this.db.db.select().from(postTable).where(eq(postTable.id, id)).get();
    if (!row) {
      throw new NotFoundException('帖子不存在');
    }
    return row;
  }

  private requireReply(id: number): ReplyRow {
    const row = this.db.db.select().from(replyTable).where(eq(replyTable.id, id)).get();
    if (!row) {
      throw new NotFoundException('回复不存在');
    }
    return row;
  }

  private isModerator(user: AccountUser | null): boolean {
    return user !== null && roleAtLeast(user.role, 'reviewer');
  }

  /** Hidden/deleted posts freeze replies for everyone except moderators. */
  private assertParentPostOperable(postId: number, actor: AccountUser, message: string): void {
    const parent = this.requirePost(postId);
    if (parent.status !== 'published' && !this.isModerator(actor)) {
      throw new BadRequestException(message);
    }
  }

  private logModeration(
    actorId: string,
    action: typeof moderationLog.$inferInsert.action,
    targetType: string,
    targetId: string,
    reason?: string,
  ): void {
    this.db.db
      .insert(moderationLog)
      .values({ actorId, action, targetType, targetId, reason: reason ?? null })
      .run();
  }
}

function toAuthor(
  user: UserRow,
  player: PlayerRow | null,
  badge?: { level: number | null; levelTier: string | null; title: UserTitleSummary | null },
): ForumAuthor {
  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    player: player ? { uuid: player.uuid, nickname: player.nickname } : null,
    level: badge?.level ?? 1,
    levelTier: badge?.levelTier ?? null,
    title: badge?.title ? { name: badge.title.name, color: badge.title.color } : null,
  };
}
