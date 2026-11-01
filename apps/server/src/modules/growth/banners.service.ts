import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AdminBannerOverview, BannerSummary } from '@mcserauth/shared';
import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { nullsLast } from '../../common/helpers/order.js';
import { DbService } from '../../db/db.service.js';
import {
  banner as bannerTable,
  moderationLog,
  notification,
  user as userTable,
  userProgress,
} from '../../db/schema/index.js';
import { RulesService } from './rules.service.js';
import { PointsService } from './points.service.js';
import { DAY_MS, toBannerSummary, type BannerRow } from './growth.util.js';

/** Public banner carousel plus the admin review/refund flow. */
@Injectable()
export class BannersService {
  constructor(
    private readonly db: DbService,
    private readonly rulesService: RulesService,
    private readonly points: PointsService,
  ) {}

  async listActiveBanners(limit = 6, now = new Date()): Promise<BannerSummary[]> {
    const rows = await this.db.db
      .select({ banner: bannerTable, ownerName: userTable.name })
      .from(bannerTable)
      .innerJoin(userTable, eq(bannerTable.userId, userTable.id))
      .where(
        and(
          eq(bannerTable.status, 'approved'),
          or(isNull(bannerTable.startsAt), lte(bannerTable.startsAt, now)),
          or(isNull(bannerTable.endsAt), gte(bannerTable.endsAt, now)),
        ),
      )
      .orderBy(nullsLast(bannerTable.startsAt), desc(bannerTable.startsAt), desc(bannerTable.id))
      .limit(Math.min((await this.rulesService.rules()).bannerMaxActive, Math.max(1, limit)));
    return rows.map((row) => toBannerSummary(row.banner, row.ownerName));
  }

  async listOwnBanners(userId: string): Promise<BannerSummary[]> {
    return (
      await this.db.db
        .select({ banner: bannerTable, ownerName: userTable.name })
        .from(bannerTable)
        .innerJoin(userTable, eq(bannerTable.userId, userTable.id))
        .where(eq(bannerTable.userId, userId))
        .orderBy(desc(bannerTable.createdAt))
    ).map((row) => toBannerSummary(row.banner, row.ownerName));
  }

  async adminBanners(status?: BannerRow['status']): Promise<AdminBannerOverview> {
    const rows = await this.db.db
      .select({ banner: bannerTable, ownerName: userTable.name })
      .from(bannerTable)
      .innerJoin(userTable, eq(bannerTable.userId, userTable.id))
      .where(status === undefined ? undefined : eq(bannerTable.status, status))
      .orderBy(desc(bannerTable.createdAt))
      .limit(100);
    return { banners: rows.map((row) => toBannerSummary(row.banner, row.ownerName)) };
  }

  async reviewBanner(actorId: string, id: number, approve: boolean): Promise<BannerSummary> {
    const row = (await this.db.db.select().from(bannerTable).where(eq(bannerTable.id, id)))[0];
    if (!row) {
      throw new NotFoundException('Banner 不存在');
    }
    if (row.status !== 'pending') {
      throw new ConflictException('该 Banner 已处理');
    }
    const owner = (
      await this.db.db
        .select({ name: userTable.name, points: userProgress.points })
        .from(userTable)
        .leftJoin(userProgress, eq(userProgress.userId, userTable.id))
        .where(eq(userTable.id, row.userId))
    )[0];
    const now = new Date();
    const rules = await this.rulesService.rules();
    const endsAt = new Date(now.getTime() + rules.bannerDays * DAY_MS);
    await this.db.transaction(async (tx) => {
      await tx
        .update(bannerTable)
        .set({
          status: approve ? 'approved' : 'rejected',
          startsAt: approve ? now : null,
          endsAt: approve ? endsAt : null,
          reviewedBy: actorId,
          reviewedAt: now,
        })
        .where(eq(bannerTable.id, id));
      if (!approve) {
        const balance = await this.points.applyPoints(
          tx,
          row.userId,
          row.pointsSpent,
          owner?.points ?? 0,
          'banner_refund',
          { memo: `Banner 未通过审核，退还积分：${row.title}`, refId: String(row.id) },
        );
        await tx
          .update(userProgress)
          .set({ points: balance, updatedAt: now })
          .where(eq(userProgress.userId, row.userId));
      }
      await tx.insert(notification).values({
        userId: row.userId,
        type: 'system',
        actorId,
        message: approve
          ? `你的 Banner「${row.title}」已通过审核，将在首页展示 ${rules.bannerDays} 天`
          : `你的 Banner「${row.title}」未通过审核，积分已退还`,
        link: '/forum/growth',
      });
      await tx.insert(moderationLog).values({
        actorId,
        action: 'review_banner',
        targetType: 'banner',
        targetId: String(id),
        reason: approve ? 'approved' : 'rejected',
      });
    });
    const updated = (await this.db.db.select().from(bannerTable).where(eq(bannerTable.id, id)))[0];
    return toBannerSummary(updated ?? row, owner?.name ?? '');
  }
}
