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
  type PostSortOption,
  type ReportTargetType,
  type UserTitleSummary,
  type VoteResponse,
} from '@mcserauth/shared';
import { and, count, desc, eq, inArray, max, ne, sql, type SQL } from 'drizzle-orm';
import { firstOrThrow } from '../../common/helpers/rows.js';
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
  async listCategories(): Promise<ForumCategory[]> {
    return await this.categories.listCategories();
  }
  // ---------------------------------------------------------------------- posts
  async listPosts(query: {
    categorySlug?: string;
    page?: number;
    pageSize?: number;
    sort?: PostSortOption;
    search?: string;
  }): Promise<Paginated<ForumPostSummary>> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 20));
    const conditions: SQL[] = [eq(postTable.status, 'published')];
    if (query.categorySlug !== undefined && query.categorySlug !== '') {
      const category = await this.categories.getCategoryBySlug(query.categorySlug);
      conditions.push(
        inArray(postTable.categoryId, await this.categories.descendantCategoryIds(category.id)),
      );
    }
    const search = query.search?.trim() ?? '';
    if (search !== '') {
      // 标题关键词：lower+like 做跨方言（sqlite/mysql/postgres）的大小写不敏感匹配。
      // 转义 %、_ 与 \，避免用户输入被当成通配符。
      const escaped = search.replace(/[\\%_]/g, (ch) => `\\${ch}`);
      conditions.push(
        sql`lower(${postTable.title}) like ${`%${escaped.toLowerCase()}%`} escape '\\'`,
      );
    }
    const orderBy = this.postListOrderBy(query.sort ?? 'activity');
    const totalRow = (
      await this.db.db
        .select({ value: count() })
        .from(postTable)
        .where(and(...conditions))
    )[0];
    const rows = await this.db.db
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
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return {
      items: await this.mapPosts(rows),
      page,
      pageSize,
      total: totalRow?.value ?? 0,
    };
  }
  /** 列表排序：activity=最新回复、created=最新发布、hot=回复+点赞聚合热度；置顶始终优先。 */
  private postListOrderBy(sort: PostSortOption): SQL[] {
    const pinnedFirst = desc(postTable.pinned);
    const idTiebreak = desc(postTable.id);
    switch (sort) {
      case 'created':
        return [pinnedFirst, desc(postTable.createdAt), idTiebreak];
      case 'hot': {
        const replyScore = sql`(select count(*) from ${replyTable} where ${replyTable.postId} = ${postTable.id} and ${replyTable.status} = 'published')`;
        const voteScore = sql`(select count(*) from ${voteTable} where ${voteTable.targetId} = ${postTable.id} and ${voteTable.targetType} = 'post')`;
        return [
          pinnedFirst,
          desc(sql`${replyScore} + ${voteScore}`),
          desc(postTable.lastActivityAt),
          idTiebreak,
        ];
      }
      default:
        return [pinnedFirst, desc(postTable.lastActivityAt), idTiebreak];
    }
  }
  async recentPostsByUser(userId: string, limit = 5): Promise<ForumPostSummary[]> {
    const rows = await this.db.db
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
      .limit(limit);
    return await this.mapPosts(rows);
  }
  async getPost(
    id: number,
    viewer: AccountUser | null,
    query: {
      replyPage?: number;
      replyPageSize?: number;
    } = {},
  ): Promise<ForumPostDetail> {
    const replyPage = Math.max(1, query.replyPage ?? 1);
    const replyPageSize = Math.min(50, Math.max(1, query.replyPageSize ?? 20));
    const row = (
      await this.db.db
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
    )[0];
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
    const summary = (await this.mapPosts([row]))[0];
    if (!summary) {
      throw new NotFoundException('帖子不存在');
    }
    const replyVisibility = this.isModerator(viewer)
      ? ne(replyTable.status, 'deleted')
      : eq(replyTable.status, 'published');
    const replyTotalRow = (
      await this.db.db
        .select({ value: count() })
        .from(replyTable)
        .where(and(eq(replyTable.postId, id), replyVisibility))
    )[0];
    const replyRows = await this.db.db
      .select({ reply: replyTable, author: userTable, player: playerTable })
      .from(replyTable)
      .innerJoin(userTable, eq(replyTable.authorId, userTable.id))
      .leftJoin(playerTable, eq(playerTable.userId, userTable.id))
      .where(and(eq(replyTable.postId, id), replyVisibility))
      .orderBy(replyTable.floor)
      .limit(replyPageSize)
      .offset((replyPage - 1) * replyPageSize);
    const replies = await this.mapReplies(replyRows, viewer);
    const postVote = (await this.loadViewerVotes([id], 'post', viewer?.id)).has(id);
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
  async createPost(
    author: AccountUser,
    input: {
      categoryId: number;
      title: string;
      contentMd: string;
    },
  ): Promise<ForumPostDetail> {
    const category = (
      await this.db.db
        .select({ id: categoryTable.id })
        .from(categoryTable)
        .where(eq(categoryTable.id, input.categoryId))
    )[0];
    if (!category) {
      throw new BadRequestException('版块不存在');
    }
    const inserted = firstOrThrow(
      await this.db.insertReturning(postTable, {
        categoryId: input.categoryId,
        authorId: author.id,
        title: input.title.trim(),
        contentMd: input.contentMd,
        status: 'published',
      }),
    );
    await this.progress.awardPostXp(author.id);
    return await this.getPost(inserted.id, author);
  }
  async updatePost(
    actor: AccountUser,
    id: number,
    input: {
      title?: string;
      contentMd?: string;
    },
  ): Promise<ForumPostDetail> {
    const row = await this.requirePost(id);
    if (row.authorId !== actor.id) {
      throw new ForbiddenException('只能编辑自己的帖子');
    }
    if (row.status === 'deleted') {
      throw new BadRequestException('帖子已删除');
    }
    await this.db.db
      .update(postTable)
      .set({
        ...(input.title === undefined ? {} : { title: input.title.trim() }),
        ...(input.contentMd === undefined ? {} : { contentMd: input.contentMd }),
      })
      .where(eq(postTable.id, id));
    return await this.getPost(id, actor);
  }
  async deletePost(actor: AccountUser, id: number): Promise<void> {
    const row = await this.requirePost(id);
    const moderator = this.isModerator(actor);
    if (row.authorId !== actor.id && !moderator) {
      throw new ForbiddenException('没有权限删除该帖子');
    }
    if (row.authorId !== actor.id) {
      await this.logModeration(actor.id, 'delete_post', 'post', String(id));
      this.notifications.notifyModeration(
        row.authorId,
        '你的帖子已被版主删除',
        `/forum/post/${id}`,
      );
    }
    await this.db.db.update(postTable).set({ status: 'deleted' }).where(eq(postTable.id, id));
  }
  // --------------------------------------------------------------------- replies
  async createReply(author: AccountUser, postId: number, contentMd: string): Promise<ForumReply> {
    const post = await this.requirePost(postId);
    if (post.status !== 'published') {
      throw new BadRequestException('该帖子当前不可回复');
    }
    if (post.locked && !this.isModerator(author)) {
      throw new ForbiddenException('帖子已锁定，无法回复');
    }
    const created = await this.db.transaction(async (tx) => {
      const floorRow = (
        await tx
          .select({ value: max(replyTable.floor) })
          .from(replyTable)
          .where(eq(replyTable.postId, postId))
      )[0];
      const inserted = firstOrThrow(
        await this.db.insertReturning(
          replyTable,
          {
            postId,
            authorId: author.id,
            contentMd,
            status: 'published',
            floor: (floorRow?.value ?? 0) + 1,
          },
          tx,
        ),
      );
      await tx
        .update(postTable)
        .set({ lastActivityAt: new Date() })
        .where(eq(postTable.id, postId));
      return inserted;
    });
    await this.notifications.notifyReply(postId, post.authorId, author.id);
    await this.notifications.notifyMentions(postId, contentMd, author.id);
    await this.progress.awardReplyXp(author.id);
    return await this.getReplyForViewer(created.id, author);
  }
  async updateReply(actor: AccountUser, id: number, contentMd: string): Promise<ForumReply> {
    const row = await this.requireReply(id);
    if (row.authorId !== actor.id) {
      throw new ForbiddenException('只能编辑自己的回复');
    }
    if (row.status !== 'published') {
      throw new BadRequestException('该回复当前不可编辑');
    }
    await this.assertParentPostOperable(row.postId, actor, '该帖子当前不可编辑回复');
    await this.db.db.update(replyTable).set({ contentMd }).where(eq(replyTable.id, id));
    return await this.getReplyForViewer(id, actor);
  }
  async deleteReply(actor: AccountUser, id: number): Promise<void> {
    const row = await this.requireReply(id);
    const moderator = this.isModerator(actor);
    if (row.authorId !== actor.id && !moderator) {
      throw new ForbiddenException('没有权限删除该回复');
    }
    if (row.authorId !== actor.id) {
      await this.logModeration(actor.id, 'delete_reply', 'reply', String(id));
      this.notifications.notifyModeration(
        row.authorId,
        '你的回复已被版主删除',
        `/forum/post/${row.postId}`,
      );
    }
    await this.db.db.update(replyTable).set({ status: 'deleted' }).where(eq(replyTable.id, id));
  }
  // ----------------------------------------------------------------------- votes
  async toggleVote(
    actor: AccountUser,
    targetType: 'post' | 'reply',
    targetId: number,
  ): Promise<VoteResponse> {
    if (targetType === 'post') {
      const target = await this.requirePost(targetId);
      if (target.status !== 'published') {
        throw new BadRequestException('该帖子当前不可点赞');
      }
      if (target.authorId === actor.id) {
        throw new BadRequestException('不能给自己的帖子点赞');
      }
    } else {
      const target = await this.requireReply(targetId);
      if (target.status !== 'published') {
        throw new BadRequestException('该回复当前不可点赞');
      }
      await this.assertParentPostOperable(target.postId, actor, '该帖子当前不可点赞');
      if (target.authorId === actor.id) {
        throw new BadRequestException('不能给自己的回复点赞');
      }
    }
    const existing = (
      await this.db.db
        .select({ id: voteTable.id })
        .from(voteTable)
        .where(
          and(
            eq(voteTable.userId, actor.id),
            eq(voteTable.targetType, targetType),
            eq(voteTable.targetId, targetId),
          ),
        )
    )[0];
    if (existing) {
      await this.db.db.delete(voteTable).where(eq(voteTable.id, existing.id));
    } else {
      await this.db.insertIgnore(voteTable, { userId: actor.id, targetType, targetId });
    }
    const total = (
      await this.db.db
        .select({ value: count() })
        .from(voteTable)
        .where(and(eq(voteTable.targetType, targetType), eq(voteTable.targetId, targetId)))
    )[0];
    return {
      targetType,
      targetId,
      voted: existing === undefined,
      voteCount: total?.value ?? 0,
    };
  }
  // --------------------------------------------------------------------- reports
  async createReport(
    actor: AccountUser,
    input: CreateReportRequest,
  ): Promise<{
    id: number;
  }> {
    const reason = input.reason.trim();
    if (reason.length < 5) {
      throw new BadRequestException('举报理由至少 5 个字符');
    }
    await this.assertReportTarget(actor, input.targetType, input.targetId);
    const duplicate = (
      await this.db.db
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
    )[0];
    if (duplicate) {
      throw new ConflictException('你已举报过该对象，等待处理中');
    }
    const inserted = firstOrThrow(
      await this.db.insertReturning(reportTable, {
        reporterId: actor.id,
        targetType: input.targetType,
        targetId: input.targetId,
        reason,
      }),
    );
    return { id: inserted.id };
  }
  private async assertReportTarget(
    actor: AccountUser,
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<void> {
    if (targetType === 'post' || targetType === 'reply' || targetType === 'skin') {
      const numeric = Number(targetId);
      if (!Number.isInteger(numeric) || numeric <= 0) {
        throw new BadRequestException('targetId 必须为正整数');
      }
      if (targetType === 'post') {
        const target = await this.requirePost(numeric);
        if (target.status !== 'published') {
          throw new BadRequestException('该帖子当前不可举报');
        }
        if (target.authorId === actor.id) {
          throw new BadRequestException('不能举报自己的内容');
        }
        return;
      }
      if (targetType === 'reply') {
        const target = await this.requireReply(numeric);
        if (target.status !== 'published') {
          throw new BadRequestException('该回复当前不可举报');
        }
        await this.assertParentPostOperable(target.postId, actor, '该帖子当前不可举报');
        if (target.authorId === actor.id) {
          throw new BadRequestException('不能举报自己的内容');
        }
        return;
      }
      const skin = (
        await this.db.db
          .select({ id: skinTable.id })
          .from(skinTable)
          .where(eq(skinTable.id, numeric))
      )[0];
      if (!skin) {
        throw new NotFoundException('纹理不存在');
      }
      return;
    }
    if (targetId === actor.id) {
      throw new BadRequestException('不能举报自己');
    }
    const targetUser = (
      await this.db.db
        .select({ id: userTable.id })
        .from(userTable)
        .where(eq(userTable.id, targetId))
    )[0];
    if (!targetUser) {
      throw new NotFoundException('用户不存在');
    }
  }
  // ------------------------------------------------------------------ moderation
  async moderatePost(
    actor: AccountUser,
    id: number,
    input: ModeratePostRequest,
  ): Promise<ModeratePostResponse> {
    const row = await this.requirePost(id);
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
    const updated = firstOrThrow(
      await this.db.updateReturning(postTable, changes, eq(postTable.id, id)),
    );
    for (const action of actions) {
      await this.logModeration(actor.id, action, 'post', String(id), input.reason);
    }
    return {
      id: updated.id,
      status: updated.status,
      pinned: updated.pinned,
      featured: updated.featured,
      locked: updated.locked,
    };
  }
  async moderateReply(
    actor: AccountUser,
    id: number,
    input: ModerateReplyRequest,
  ): Promise<ModerateReplyResponse> {
    const row = await this.requireReply(id);
    if (input.status === undefined || input.status === row.status) {
      throw new BadRequestException('没有需要更新的字段');
    }
    const updated = firstOrThrow(
      await this.db.updateReturning(replyTable, { status: input.status }, eq(replyTable.id, id)),
    );
    const action: ModerationAction =
      input.status === 'published'
        ? 'restore_reply'
        : input.status === 'deleted'
          ? 'delete_reply'
          : 'hide_reply';
    await this.logModeration(actor.id, action, 'reply', String(id), input.reason);
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
  private async mapPosts(rows: PostJoinRow[]): Promise<ForumPostSummary[]> {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((row) => row.post.id);
    const replyCounts = await this.db.db
      .select({ postId: replyTable.postId, value: count() })
      .from(replyTable)
      .where(and(inArray(replyTable.postId, ids), eq(replyTable.status, 'published')))
      .groupBy(replyTable.postId);
    const voteCounts = await this.db.db
      .select({ targetId: voteTable.targetId, value: count() })
      .from(voteTable)
      .where(and(eq(voteTable.targetType, 'post'), inArray(voteTable.targetId, ids)))
      .groupBy(voteTable.targetId);
    const replyMap = new Map(replyCounts.map((row) => [row.postId, row.value]));
    const voteMap = new Map(voteCounts.map((row) => [row.targetId, row.value]));
    const badges = await this.progress.badgesFor(rows.map((row) => row.author.id));
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
  private async mapReplies(
    rows: ReplyJoinRow[],
    viewer: AccountUser | null,
  ): Promise<ForumReply[]> {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((row) => row.reply.id);
    const voteCounts = await this.db.db
      .select({ targetId: voteTable.targetId, value: count() })
      .from(voteTable)
      .where(and(eq(voteTable.targetType, 'reply'), inArray(voteTable.targetId, ids)))
      .groupBy(voteTable.targetId);
    const voteMap = new Map(voteCounts.map((row) => [row.targetId, row.value]));
    const viewerVotes = await this.loadViewerVotes(ids, 'reply', viewer?.id);
    const badges = await this.progress.badgesFor(rows.map((row) => row.author.id));
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
  private async getReplyForViewer(id: number, viewer: AccountUser): Promise<ForumReply> {
    const row = (
      await this.db.db
        .select({ reply: replyTable, author: userTable, player: playerTable })
        .from(replyTable)
        .innerJoin(userTable, eq(replyTable.authorId, userTable.id))
        .leftJoin(playerTable, eq(playerTable.userId, userTable.id))
        .where(eq(replyTable.id, id))
    )[0];
    if (!row) {
      throw new NotFoundException('回复不存在');
    }
    const mapped = (await this.mapReplies([row], viewer))[0];
    if (!mapped) {
      throw new NotFoundException('回复不存在');
    }
    return mapped;
  }
  private async loadViewerVotes(
    targetIds: number[],
    targetType: 'post' | 'reply',
    viewerId: string | undefined,
  ): Promise<Set<number>> {
    if (viewerId === undefined || targetIds.length === 0) {
      return new Set();
    }
    const rows = await this.db.db
      .select({ targetId: voteTable.targetId })
      .from(voteTable)
      .where(
        and(
          eq(voteTable.userId, viewerId),
          eq(voteTable.targetType, targetType),
          inArray(voteTable.targetId, targetIds),
        ),
      );
    return new Set(rows.map((row) => row.targetId));
  }
  private async requirePost(id: number): Promise<PostRow> {
    const row = (await this.db.db.select().from(postTable).where(eq(postTable.id, id)))[0];
    if (!row) {
      throw new NotFoundException('帖子不存在');
    }
    return row;
  }
  private async requireReply(id: number): Promise<ReplyRow> {
    const row = (await this.db.db.select().from(replyTable).where(eq(replyTable.id, id)))[0];
    if (!row) {
      throw new NotFoundException('回复不存在');
    }
    return row;
  }
  private isModerator(user: AccountUser | null): boolean {
    return user !== null && roleAtLeast(user.role, 'reviewer');
  }
  /** Hidden/deleted posts freeze replies for everyone except moderators. */
  private async assertParentPostOperable(
    postId: number,
    actor: AccountUser,
    message: string,
  ): Promise<void> {
    const parent = await this.requirePost(postId);
    if (parent.status !== 'published' && !this.isModerator(actor)) {
      throw new BadRequestException(message);
    }
  }
  private async logModeration(
    actorId: string,
    action: typeof moderationLog.$inferInsert.action,
    targetType: string,
    targetId: string,
    reason?: string,
  ): Promise<void> {
    await this.db.db
      .insert(moderationLog)
      .values({ actorId, action, targetType, targetId, reason: reason ?? null });
  }
}
function toAuthor(
  user: UserRow,
  player: PlayerRow | null,
  badge?: {
    level: number | null;
    levelTier: string | null;
    title: UserTitleSummary | null;
  },
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
