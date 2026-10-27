import { Injectable } from '@nestjs/common';
import type { NotificationListResponse } from '@mcserauth/shared';
import { and, count, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { DbService } from '../../db/db.service.js';
import { notification, player, user } from '../../db/schema/index.js';
import { extractMentionNames } from './forum.helpers.js';
const REPLY_DEDUPE_MS = 10 * 60 * 1000;
interface CreateNotificationInput {
  userId: string;
  type: 'reply' | 'mention' | 'system' | 'moderation';
  actorId?: string | null;
  message?: string | null;
  link?: string | null;
}
/** In-site notifications: replies, mentions, moderation and system notices. */
@Injectable()
export class NotificationsService {
  constructor(private readonly db: DbService) {}
  async list(
    userId: string,
    query: {
      page?: number;
      pageSize?: number;
    } = {},
  ): Promise<NotificationListResponse> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 20));
    const rows = await this.db.db
      .select({
        notification,
        actorId: user.id,
        actorName: user.name,
      })
      .from(notification)
      .leftJoin(user, eq(notification.actorId, user.id))
      .where(eq(notification.userId, userId))
      .orderBy(desc(notification.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const total = (
      await this.db.db
        .select({ value: count() })
        .from(notification)
        .where(eq(notification.userId, userId))
    )[0];
    const unread = (
      await this.db.db
        .select({ value: count() })
        .from(notification)
        .where(and(eq(notification.userId, userId), isNull(notification.readAt)))
    )[0];
    return {
      items: rows.map(({ notification: row, actorId, actorName }) => ({
        id: row.id,
        type: row.type,
        actor: actorId === null ? null : { id: actorId, name: actorName ?? '' },
        message: row.message,
        link: row.link,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      unreadCount: unread?.value ?? 0,
      page,
      pageSize,
      total: total?.value ?? 0,
    };
  }
  async unreadCount(userId: string): Promise<number> {
    const row = (
      await this.db.db
        .select({ value: count() })
        .from(notification)
        .where(and(eq(notification.userId, userId), isNull(notification.readAt)))
    )[0];
    return row?.value ?? 0;
  }
  async markRead(userId: string, id: number): Promise<boolean> {
    const updated = await this.db.db
      .update(notification)
      .set({ readAt: new Date() })
      .where(
        and(eq(notification.id, id), eq(notification.userId, userId), isNull(notification.readAt)),
      );
    return this.db.affectedRows(updated) > 0;
  }
  async markAllRead(userId: string): Promise<number> {
    const result = await this.db.db
      .update(notification)
      .set({ readAt: new Date() })
      .where(and(eq(notification.userId, userId), isNull(notification.readAt)));
    return this.db.affectedRows(result);
  }
  async notifyReply(postId: number, postAuthorId: string, actorId: string): Promise<void> {
    if (postAuthorId === actorId) {
      return;
    }
    const link = `/forum/post/${postId}`;
    const recent = (
      await this.db.db
        .select({ id: notification.id })
        .from(notification)
        .where(
          and(
            eq(notification.userId, postAuthorId),
            eq(notification.type, 'reply'),
            eq(notification.actorId, actorId),
            eq(notification.link, link),
            gt(notification.createdAt, new Date(Date.now() - REPLY_DEDUPE_MS)),
          ),
        )
    )[0];
    if (recent) {
      return;
    }
    await this.create({ userId: postAuthorId, type: 'reply', actorId, link });
  }
  async notifyMentions(postId: number, contentMd: string, actorId: string): Promise<void> {
    const names = extractMentionNames(contentMd).filter((name) => name.length > 0);
    if (names.length === 0) {
      return;
    }
    // Prefer game nicknames; fall back to website display names for accounts
    // that have not provisioned a player yet.
    const players = await this.db.db
      .select({ userId: player.userId, nickname: player.nickname })
      .from(player)
      .where(inArray(player.nickname, names));
    const matchedNames = new Set(players.map((row) => row.nickname));
    const remainingNames = names.filter((name) => !matchedNames.has(name));
    const users =
      remainingNames.length === 0
        ? []
        : await this.db.db
            .select({ id: user.id })
            .from(user)
            .where(inArray(user.name, remainingNames));
    const targetIds = new Set<string>([
      ...players.map((row) => row.userId),
      ...users.map((row) => row.id),
    ]);
    for (const targetId of targetIds) {
      if (targetId === actorId) {
        continue;
      }
      await this.create({
        userId: targetId,
        type: 'mention',
        actorId,
        link: `/forum/post/${postId}`,
      });
    }
  }
  async notifyModeration(userId: string, message: string, link?: string): Promise<void> {
    await this.create({ userId, type: 'moderation', message, link: link ?? null });
  }
  /** Fan-out announcement; returns the number of recipients. */
  async announce(message: string, link?: string | null): Promise<number> {
    const users = await this.db.db.select({ id: user.id }).from(user);
    const chunkSize = 400;
    await this.db.transaction(async (tx) => {
      for (let index = 0; index < users.length; index += chunkSize) {
        const rows = users.slice(index, index + chunkSize).map((row) => ({
          userId: row.id,
          type: 'system' as const,
          message,
          link: link ?? null,
        }));
        if (rows.length > 0) {
          await tx.insert(notification).values(rows);
        }
      }
    });
    return users.length;
  }
  private async create(input: CreateNotificationInput): Promise<void> {
    await this.db.db.insert(notification).values({
      userId: input.userId,
      type: input.type,
      actorId: input.actorId ?? null,
      message: input.message ?? null,
      link: input.link ?? null,
    });
  }
}
