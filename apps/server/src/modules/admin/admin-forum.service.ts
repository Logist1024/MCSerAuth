import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ROLE_RANK,
  normalizeUserRole,
  type AdminCategory,
  type AdminReport,
  type AdminStats,
  type AdminUserSummary,
  type BanUserRequest,
  type CreateAnnouncementRequest,
  type HandleReportRequest,
  type ModeratePostRequest,
  type ModeratePostResponse,
  type ModerateReplyRequest,
  type ModerateReplyResponse,
  type ModerationAction,
  type MuteUserRequest,
  type Paginated,
  type UnbanUserRequest,
  type UnmuteUserRequest,
} from '@mcserauth/shared';
import { and, count, desc, eq, gt, inArray, isNull, like, or, type SQL } from 'drizzle-orm';
import { alias, type PgTable } from 'drizzle-orm/pg-core';
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
  token as tokenTable,
  user as userTable,
  userPermission,
} from '../../db/schema/index.js';
import { ProgressService } from '../growth/progress.service.js';
import type { AdminActor } from './admin-access.service.js';
import type {
  AdminCategoryDto,
  AdminReportListQueryDto,
  AdminUserListQueryDto,
  UpdateAdminCategoryDto,
} from './dto/admin-forum.dto.js';
import { ForumService } from '../forum/forum.service.js';
import { NotificationsService } from '../forum/notifications.service.js';
type UserRow = typeof userTable.$inferSelect;
function clampPagination(
  page: number | undefined,
  pageSize: number | undefined,
): {
  page: number;
  pageSize: number;
} {
  return {
    page: Math.max(1, page ?? 1),
    pageSize: Math.min(100, Math.max(1, pageSize ?? 20)),
  };
}
/** Admin operations for users, reports, content moderation, categories and stats. */
@Injectable()
export class AdminForumService {
  constructor(
    private readonly db: DbService,
    private readonly forum: ForumService,
    private readonly notifications: NotificationsService,
    private readonly progress: ProgressService,
  ) {}
  async stats(): Promise<AdminStats> {
    return {
      users: {
        total: await this.countWhere(userTable),
        banned: await this.countWhere(userTable, eq(userTable.banned, true)),
      },
      players: {
        total: await this.countWhere(playerTable),
        banned: await this.countWhere(playerTable, eq(playerTable.banned, true)),
      },
      posts: {
        total: await this.countWhere(postTable),
        published: await this.countWhere(postTable, eq(postTable.status, 'published')),
        pending: await this.countWhere(postTable, eq(postTable.status, 'pending')),
        hidden: await this.countWhere(postTable, eq(postTable.status, 'hidden')),
      },
      replies: {
        total: await this.countWhere(replyTable),
        published: await this.countWhere(replyTable, eq(replyTable.status, 'published')),
      },
      reports: {
        pending: await this.countWhere(reportTable, eq(reportTable.status, 'pending')),
        resolved: await this.countWhere(reportTable, eq(reportTable.status, 'resolved')),
        rejected: await this.countWhere(reportTable, eq(reportTable.status, 'rejected')),
      },
      skins: {
        pending: await this.countWhere(skinTable, eq(skinTable.status, 'pending')),
        approved: await this.countWhere(skinTable, eq(skinTable.status, 'approved')),
        rejected: await this.countWhere(skinTable, eq(skinTable.status, 'rejected')),
      },
      tokens: {
        active: await this.countWhere(
          tokenTable,
          and(isNull(tokenTable.revokedAt), gt(tokenTable.expiresAt, new Date())),
        ),
      },
      categories: await this.countWhere(categoryTable),
    };
  }
  async listUsers(query: AdminUserListQueryDto): Promise<Paginated<AdminUserSummary>> {
    const { page, pageSize } = clampPagination(query.page, query.pageSize);
    const search = query.search?.trim();
    const condition =
      search === undefined || search === ''
        ? undefined
        : or(like(userTable.name, `%${search}%`), like(userTable.email, `%${search}%`));
    const total = await this.countWhere(userTable, condition);
    const rows = await this.db.db
      .select({ user: userTable, player: playerTable })
      .from(userTable)
      .leftJoin(playerTable, eq(playerTable.userId, userTable.id))
      .where(condition)
      .orderBy(desc(userTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const userIds = rows.map((row) => row.user.id);
    const postCounts =
      userIds.length === 0
        ? []
        : await this.db.db
            .select({ authorId: postTable.authorId, value: count() })
            .from(postTable)
            .where(and(inArray(postTable.authorId, userIds), eq(postTable.status, 'published')))
            .groupBy(postTable.authorId);
    const postCountMap = new Map(postCounts.map((row) => [row.authorId, row.value]));
    const badges = await this.progress.badgesFor(userIds);
    const wallets = await this.progress.walletsFor(userIds);
    const permissionRows =
      userIds.length === 0
        ? []
        : await this.db.db
            .select({ userId: userPermission.userId, permission: userPermission.permission })
            .from(userPermission)
            .where(inArray(userPermission.userId, userIds));
    const permissionMap = new Map<string, Array<(typeof permissionRows)[number]['permission']>>();
    for (const row of permissionRows) {
      const list = permissionMap.get(row.userId) ?? [];
      list.push(row.permission);
      permissionMap.set(row.userId, list);
    }
    return {
      items: rows.map(({ user, player }) => {
        const badge = badges.get(user.id);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: normalizeUserRole(user.role),
          banned: user.banned,
          mutedUntil: user.mutedUntil?.toISOString() ?? null,
          createdAt: user.createdAt.toISOString(),
          player: player
            ? { uuid: player.uuid, nickname: player.nickname, banned: player.banned }
            : null,
          postCount: postCountMap.get(user.id) ?? 0,
          level: badge?.level ?? 1,
          points: wallets.get(user.id) ?? 0,
          title: badge?.title ? { name: badge.title.name, color: badge.title.color } : null,
          permissions: permissionMap.get(user.id) ?? [],
        };
      }),
      page,
      pageSize,
      total,
    };
  }
  async banUser(
    actor: AdminActor,
    userId: string,
    input: BanUserRequest,
  ): Promise<AdminUserSummary> {
    const target = await this.requireUser(userId);
    if (target.id === actor.userId) {
      throw new ForbiddenException('不能封禁自己');
    }
    if (ROLE_RANK[normalizeUserRole(target.role)] >= ROLE_RANK[normalizeUserRole(actor.role)]) {
      throw new ForbiddenException('不能封禁同级或更高权限的账号');
    }
    const banForum = input.banForum ?? true;
    const banGame = input.banGame ?? true;
    if (!banForum && !banGame) {
      throw new BadRequestException('至少选择封禁论坛或游戏');
    }
    if (banForum) {
      await this.db.db.update(userTable).set({ banned: true }).where(eq(userTable.id, userId));
    }
    if (banGame) {
      await this.db.db
        .update(playerTable)
        .set({ banned: true })
        .where(eq(playerTable.userId, userId));
    }
    const reason = input.reason?.trim() || undefined;
    await this.log(actor.userId, 'ban_user', 'user', userId, reason);
    this.notifications.notifyModeration(userId, `你的账号已被封禁${reason ? `：${reason}` : ''}`);
    return await this.getUserSummary(userId);
  }
  async unbanUser(
    actor: AdminActor,
    userId: string,
    input: UnbanUserRequest,
  ): Promise<AdminUserSummary> {
    const target = await this.requireUser(userId);
    if (target.id === actor.userId) {
      throw new ForbiddenException('不能解封自己');
    }
    if (ROLE_RANK[normalizeUserRole(target.role)] >= ROLE_RANK[normalizeUserRole(actor.role)]) {
      throw new ForbiddenException('不能操作同级或更高权限的账号');
    }
    const unbanForum = input.unbanForum ?? true;
    const unbanGame = input.unbanGame ?? true;
    if (!unbanForum && !unbanGame) {
      throw new BadRequestException('至少选择解封论坛或游戏');
    }
    if (unbanForum) {
      await this.db.db.update(userTable).set({ banned: false }).where(eq(userTable.id, userId));
    }
    if (unbanGame) {
      await this.db.db
        .update(playerTable)
        .set({ banned: false })
        .where(eq(playerTable.userId, userId));
    }
    const reason = input.reason?.trim() || undefined;
    await this.log(actor.userId, 'unban_user', 'user', userId, reason);
    this.notifications.notifyModeration(userId, '你的账号已被解封');
    return await this.getUserSummary(userId);
  }
  async muteUser(
    actor: AdminActor,
    userId: string,
    input: MuteUserRequest,
  ): Promise<AdminUserSummary> {
    const target = await this.requireUser(userId);
    if (target.id === actor.userId) {
      throw new ForbiddenException('不能禁言自己');
    }
    if (ROLE_RANK[normalizeUserRole(target.role)] >= ROLE_RANK[normalizeUserRole(actor.role)]) {
      throw new ForbiddenException('不能禁言同级或更高权限的账号');
    }
    const durationHours = input.durationHours;
    if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 720) {
      throw new BadRequestException('禁言时长必须是 1–720 小时');
    }
    const mutedUntil = new Date(Date.now() + durationHours * 60 * 60 * 1000);
    await this.db.db.update(userTable).set({ mutedUntil }).where(eq(userTable.id, userId));
    const reason = input.reason?.trim() || undefined;
    await this.log(actor.userId, 'mute_user', 'user', userId, reason);
    this.notifications.notifyModeration(
      userId,
      `你已被禁言至 ${mutedUntil.toLocaleString('zh-CN', { hour12: false })}${reason ? `：${reason}` : ''}`,
    );
    return await this.getUserSummary(userId);
  }
  async unmuteUser(
    actor: AdminActor,
    userId: string,
    input: UnmuteUserRequest,
  ): Promise<AdminUserSummary> {
    const target = await this.requireUser(userId);
    if (target.id === actor.userId) {
      throw new ForbiddenException('不能解除自己的禁言');
    }
    if (ROLE_RANK[normalizeUserRole(target.role)] >= ROLE_RANK[normalizeUserRole(actor.role)]) {
      throw new ForbiddenException('不能操作同级或更高权限的账号');
    }
    await this.db.db.update(userTable).set({ mutedUntil: null }).where(eq(userTable.id, userId));
    const reason = input.reason?.trim() || undefined;
    await this.log(actor.userId, 'unmute_user', 'user', userId, reason);
    this.notifications.notifyModeration(userId, '你的禁言已解除');
    return await this.getUserSummary(userId);
  }
  async listReports(query: AdminReportListQueryDto): Promise<Paginated<AdminReport>> {
    const { page, pageSize } = clampPagination(query.page, query.pageSize);
    const status = query.status ?? 'pending';
    const condition = eq(reportTable.status, status);
    const total = await this.countWhere(reportTable, condition);
    const reporter = alias(userTable, 'reporter');
    const handler = alias(userTable, 'handler');
    const rows = await this.db.db
      .select({
        report: reportTable,
        reporterId: reporter.id,
        reporterName: reporter.name,
        handlerId: handler.id,
        handlerName: handler.name,
      })
      .from(reportTable)
      .innerJoin(reporter, eq(reportTable.reporterId, reporter.id))
      .leftJoin(handler, eq(reportTable.handledBy, handler.id))
      .where(condition)
      .orderBy(desc(reportTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return {
      items: rows.map(({ report, reporterId, reporterName, handlerId, handlerName }) => ({
        id: report.id,
        targetType: report.targetType,
        targetId: report.targetId,
        reason: report.reason,
        status: report.status,
        reporter: { id: reporterId, name: reporterName },
        handledBy: handlerId === null ? null : { id: handlerId, name: handlerName ?? '' },
        createdAt: report.createdAt.toISOString(),
      })),
      page,
      pageSize,
      total,
    };
  }
  async handleReport(
    actor: AdminActor,
    id: number,
    status: 'resolved' | 'rejected',
    input: HandleReportRequest,
  ): Promise<AdminReport> {
    const row = (await this.db.db.select().from(reportTable).where(eq(reportTable.id, id)))[0];
    if (!row) {
      throw new NotFoundException('举报不存在');
    }
    if (row.status !== 'pending') {
      throw new BadRequestException('该举报已处理');
    }
    await this.db.db
      .update(reportTable)
      .set({ status, handledBy: actor.userId })
      .where(eq(reportTable.id, id));
    const reason = input.reason?.trim() || undefined;
    await this.log(
      actor.userId,
      status === 'resolved' ? 'resolve_report' : 'reject_report',
      'report',
      String(id),
      reason,
    );
    if (row.reporterId !== actor.userId) {
      this.notifications.notifyModeration(
        row.reporterId,
        status === 'resolved' ? '你的举报已处理' : '你的举报被驳回',
      );
    }
    const reporter = await this.requireUser(row.reporterId);
    return {
      id: row.id,
      targetType: row.targetType,
      targetId: row.targetId,
      reason: row.reason,
      status,
      reporter: { id: reporter.id, name: reporter.name },
      handledBy: { id: actor.userId, name: actor.user.name },
      createdAt: row.createdAt.toISOString(),
    };
  }
  async moderatePost(
    actor: AdminActor,
    id: number,
    input: ModeratePostRequest,
  ): Promise<ModeratePostResponse> {
    return await this.forum.moderatePost(actor.user, id, input);
  }
  async moderateReply(
    actor: AdminActor,
    id: number,
    input: ModerateReplyRequest,
  ): Promise<ModerateReplyResponse> {
    return await this.forum.moderateReply(actor.user, id, input);
  }
  async listCategories(): Promise<AdminCategory[]> {
    const rows = await this.db.db
      .select()
      .from(categoryTable)
      .orderBy(categoryTable.sortOrder, categoryTable.id);
    const counts = await this.db.db
      .select({ categoryId: postTable.categoryId, value: count() })
      .from(postTable)
      .groupBy(postTable.categoryId);
    const countMap = new Map(counts.map((row) => [row.categoryId, row.value]));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      sortOrder: row.sortOrder,
      parentId: row.parentId,
      postCount: countMap.get(row.id) ?? 0,
    }));
  }
  async createCategory(actor: AdminActor, input: AdminCategoryDto): Promise<AdminCategory> {
    await this.assertSlugAvailable(input.slug);
    if (input.parentId !== null && input.parentId !== undefined) {
      await this.requireCategory(input.parentId);
    }
    const inserted = firstOrThrow(
      await this.db.insertReturning(categoryTable, {
        name: input.name.trim(),
        slug: input.slug,
        description: input.description?.trim() || null,
        sortOrder: input.sortOrder ?? 0,
        parentId: input.parentId ?? null,
      }),
    );
    await this.log(actor.userId, 'create_category', 'category', String(inserted.id));
    return { ...inserted, postCount: 0 };
  }
  async updateCategory(
    actor: AdminActor,
    id: number,
    input: UpdateAdminCategoryDto,
  ): Promise<AdminCategory> {
    await this.requireCategory(id);
    const changes: Record<string, unknown> = {};
    if (input.name !== undefined) {
      changes.name = input.name.trim();
    }
    if (input.slug !== undefined) {
      await this.assertSlugAvailable(input.slug, id);
      changes.slug = input.slug;
    }
    if (input.description !== undefined) {
      changes.description = input.description?.trim() || null;
    }
    if (input.sortOrder !== undefined) {
      changes.sortOrder = input.sortOrder;
    }
    if (input.parentId !== undefined) {
      if (input.parentId === id) {
        throw new BadRequestException('版块不能作为自己的父级');
      }
      if (input.parentId !== null) {
        await this.requireCategory(input.parentId);
        await this.assertNoCycle(id, input.parentId);
      }
      changes.parentId = input.parentId;
    }
    if (Object.keys(changes).length === 0) {
      throw new BadRequestException('没有需要更新的字段');
    }
    await this.db.db.update(categoryTable).set(changes).where(eq(categoryTable.id, id));
    await this.log(actor.userId, 'update_category', 'category', String(id));
    const updated = await this.requireCategory(id);
    const posts = (
      await this.db.db
        .select({ value: count() })
        .from(postTable)
        .where(eq(postTable.categoryId, id))
    )[0];
    return { ...updated, postCount: posts?.value ?? 0 };
  }
  async deleteCategory(
    actor: AdminActor,
    id: number,
  ): Promise<{
    deleted: true;
  }> {
    await this.requireCategory(id);
    const posts = (
      await this.db.db
        .select({ value: count() })
        .from(postTable)
        .where(eq(postTable.categoryId, id))
    )[0];
    if ((posts?.value ?? 0) > 0) {
      throw new ConflictException('版块下仍有帖子，无法删除');
    }
    const children = (
      await this.db.db
        .select({ value: count() })
        .from(categoryTable)
        .where(eq(categoryTable.parentId, id))
    )[0];
    if ((children?.value ?? 0) > 0) {
      throw new ConflictException('版块下仍有子版块，无法删除');
    }
    await this.db.db.delete(categoryTable).where(eq(categoryTable.id, id));
    await this.log(actor.userId, 'delete_category', 'category', String(id));
    return { deleted: true };
  }
  async announce(
    actor: AdminActor,
    input: CreateAnnouncementRequest,
  ): Promise<{
    recipients: number;
  }> {
    const recipients = await this.notifications.announce(input.message.trim(), input.link ?? null);
    await this.log(actor.userId, 'announce', 'system', 'all', input.message.trim());
    return { recipients };
  }
  private async getUserSummary(userId: string): Promise<AdminUserSummary> {
    const row = (
      await this.db.db
        .select({ user: userTable, player: playerTable })
        .from(userTable)
        .leftJoin(playerTable, eq(playerTable.userId, userTable.id))
        .where(eq(userTable.id, userId))
    )[0];
    if (!row) {
      throw new NotFoundException('用户不存在');
    }
    const posts = (
      await this.db.db
        .select({ value: count() })
        .from(postTable)
        .where(and(eq(postTable.authorId, userId), eq(postTable.status, 'published')))
    )[0];
    const badge = (await this.progress.badgesFor([userId])).get(userId);
    const permissions = (
      await this.db.db
        .select({ permission: userPermission.permission })
        .from(userPermission)
        .where(eq(userPermission.userId, userId))
    ).map((entry) => entry.permission);
    return {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      role: normalizeUserRole(row.user.role),
      banned: row.user.banned,
      mutedUntil: row.user.mutedUntil?.toISOString() ?? null,
      createdAt: row.user.createdAt.toISOString(),
      player: row.player
        ? { uuid: row.player.uuid, nickname: row.player.nickname, banned: row.player.banned }
        : null,
      postCount: posts?.value ?? 0,
      level: badge?.level ?? 1,
      points: (await this.progress.walletsFor([userId])).get(userId) ?? 0,
      title: badge?.title ? { name: badge.title.name, color: badge.title.color } : null,
      permissions,
    };
  }
  private async requireUser(userId: string): Promise<UserRow> {
    const row = (await this.db.db.select().from(userTable).where(eq(userTable.id, userId)))[0];
    if (!row) {
      throw new NotFoundException('用户不存在');
    }
    return row;
  }
  private async requireCategory(id: number) {
    const row = (await this.db.db.select().from(categoryTable).where(eq(categoryTable.id, id)))[0];
    if (!row) {
      throw new NotFoundException('版块不存在');
    }
    return row;
  }
  private async assertSlugAvailable(slug: string, excludeId?: number): Promise<void> {
    const rows = await this.db.db
      .select({ id: categoryTable.id })
      .from(categoryTable)
      .where(eq(categoryTable.slug, slug));
    if (rows.some((row) => row.id !== excludeId)) {
      throw new ConflictException('slug 已被使用');
    }
  }
  private async assertNoCycle(id: number, parentId: number): Promise<void> {
    const rows = await this.db.db
      .select({ id: categoryTable.id, parentId: categoryTable.parentId })
      .from(categoryTable);
    const parents = new Map(rows.map((row) => [row.id, row.parentId]));
    let cursor: number | null = parentId;
    const guard = new Set<number>();
    while (cursor !== null) {
      if (cursor === id || guard.has(cursor)) {
        throw new BadRequestException('父级设置会形成循环');
      }
      guard.add(cursor);
      cursor = parents.get(cursor) ?? null;
    }
  }
  private async countWhere(table: PgTable, condition?: SQL): Promise<number> {
    const row = (await this.db.db.select({ value: count() }).from(table).where(condition))[0] as
      | {
          value: number;
        }
      | undefined;
    return row?.value ?? 0;
  }
  private async log(
    actorId: string,
    action: ModerationAction,
    targetType: string,
    targetId: string,
    reason?: string,
  ): Promise<void> {
    await this.db.db
      .insert(moderationLog)
      .values({ actorId, action, targetType, targetId, reason: reason ?? null });
  }
}
