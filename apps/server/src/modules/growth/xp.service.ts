import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  LEVEL_MAX,
  XP_PER_LEVEL,
  levelFromXp,
  tierForLevel,
  xpForLevel,
  type UserProgressSummary,
  type UserTitleSummary,
} from '@mcserauth/shared';
import { and, count, desc, eq, gte, inArray } from 'drizzle-orm';
import { DbService } from '../../db/db.service.js';
import {
  post as postTable,
  reply as replyTable,
  title as titleTable,
  userProgress,
  userTitle,
} from '../../db/schema/index.js';
import { RulesService } from './rules.service.js';
import { dayKey, startOfShanghaiDay, toTitleSummary, type ProgressRow } from './growth.util.js';

/**
 * Progress rows, the level curve, XP awards and the special-title exemption
 * that keeps title holders off the level ladder.
 */
@Injectable()
export class XpService {
  private readonly logger = new Logger(XpService.name);
  constructor(
    private readonly db: DbService,
    private readonly rulesService: RulesService,
  ) {}

  async ensure(userId: string): Promise<ProgressRow> {
    const existing = (
      await this.db.db.select().from(userProgress).where(eq(userProgress.userId, userId))
    )[0];
    if (existing) {
      return existing;
    }
    await this.db.insertIgnore(userProgress, { userId });
    const created = (
      await this.db.db.select().from(userProgress).where(eq(userProgress.userId, userId))
    )[0];
    if (!created) {
      throw new NotFoundException('账号不存在');
    }
    return created;
  }

  async summary(userId: string, now = new Date()): Promise<UserProgressSummary> {
    const row = await this.ensure(userId);
    const level = levelFromXp(row.xp);
    const tier = tierForLevel(level);
    const title = await this.activeTitle(userId);
    const levelExempt = title !== null && title.kind === 'special';
    const isMaxLevel = level >= LEVEL_MAX;
    const xpIntoLevel = isMaxLevel ? XP_PER_LEVEL : row.xp - xpForLevel(level);
    const xpForNextLevel = isMaxLevel ? null : xpForLevel(level + 1) - row.xp;
    return {
      userId,
      xp: row.xp,
      level,
      levelTier: tier,
      xpIntoLevel,
      xpForNextLevel,
      progressPercent: isMaxLevel ? 100 : Math.floor((xpIntoLevel / XP_PER_LEVEL) * 100),
      isMaxLevel,
      points: row.points,
      checkinStreak: row.checkinStreak,
      lastCheckinOn: row.lastCheckinOn,
      checkedInToday: row.lastCheckinOn === dayKey(now),
      totalCheckins: row.totalCheckins,
      xpBoostUntil: row.xpBoostUntil?.toISOString() ?? null,
      xpBoostActive: row.xpBoostUntil !== null && row.xpBoostUntil.getTime() > now.getTime(),
      capeUnlocked: row.capeUnlockedAt !== null,
      title,
      levelExempt,
    };
  }

  /**
   * Special titles (sponsor / partner / friend) opt the account out of the
   * level system: they earn no XP and never appear on the leaderboard.
   * Custom titles earned at level 100 stay inside the ladder.
   */
  async hasSpecialTitle(userId: string): Promise<boolean> {
    const row = (
      await this.db.db
        .select({ id: titleTable.id })
        .from(userTitle)
        .innerJoin(titleTable, eq(userTitle.titleId, titleTable.id))
        .where(and(eq(userTitle.userId, userId), eq(titleTable.kind, 'special')))
    )[0];
    return row !== undefined;
  }

  async activeTitle(userId: string): Promise<UserTitleSummary | null> {
    const row = (
      await this.db.db
        .select({ title: titleTable })
        .from(userTitle)
        .innerJoin(titleTable, eq(userTitle.titleId, titleTable.id))
        .where(eq(userTitle.userId, userId))
        .orderBy(desc(userTitle.grantedAt), desc(userTitle.id))
    )[0];
    return row ? toTitleSummary(row.title) : null;
  }

  /** Batch badge lookup for forum authors; title holders hide their level. */
  async badgesFor(userIds: string[]): Promise<
    Map<
      string,
      {
        level: number | null;
        levelTier: string | null;
        title: UserTitleSummary | null;
      }
    >
  > {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) {
      return new Map();
    }
    const progress = await this.db.db
      .select()
      .from(userProgress)
      .where(inArray(userProgress.userId, unique));
    const titles = await this.db.db
      .select({ userId: userTitle.userId, title: titleTable, grantedAt: userTitle.grantedAt })
      .from(userTitle)
      .innerJoin(titleTable, eq(userTitle.titleId, titleTable.id))
      .where(inArray(userTitle.userId, unique))
      .orderBy(desc(userTitle.grantedAt), desc(userTitle.id));
    const titleMap = new Map<string, UserTitleSummary>();
    for (const row of titles) {
      if (!titleMap.has(row.userId)) {
        titleMap.set(row.userId, toTitleSummary(row.title));
      }
    }
    const progressMap = new Map(progress.map((row) => [row.userId, row]));
    const result = new Map<
      string,
      {
        level: number | null;
        levelTier: string | null;
        title: UserTitleSummary | null;
      }
    >();
    for (const userId of unique) {
      const title = titleMap.get(userId) ?? null;
      const level = levelFromXp(progressMap.get(userId)?.xp ?? 0);
      result.set(userId, {
        level: title === null ? level : null,
        levelTier: title === null ? tierForLevel(level).name : null,
        title,
      });
    }
    return result;
  }

  async awardXp(
    userId: string,
    baseXp: number,
    memo: string | null = null,
    now = new Date(),
  ): Promise<number> {
    if (baseXp <= 0) {
      return 0;
    }
    if (await this.hasSpecialTitle(userId)) {
      return 0;
    }
    const row = await this.ensure(userId);
    const boosted = row.xpBoostUntil !== null && row.xpBoostUntil.getTime() > now.getTime();
    const awarded = Math.floor(
      baseXp * (boosted ? (await this.rulesService.rules()).xpBoostMultiplier : 1),
    );
    const xp = Math.min(LEVEL_MAX * XP_PER_LEVEL, row.xp + awarded);
    await this.db.db
      .update(userProgress)
      .set({ xp, level: levelFromXp(xp), updatedAt: now })
      .where(eq(userProgress.userId, userId));
    if (memo !== null) {
      this.logger.debug(`+${awarded} XP (${memo}) -> ${userId}`);
    }
    return awarded;
  }

  async awardPostXp(userId: string, now = new Date()): Promise<number> {
    const today = (
      await this.db.db
        .select({ value: count() })
        .from(postTable)
        .where(
          and(
            eq(postTable.authorId, userId),
            eq(postTable.status, 'published'),
            gte(postTable.createdAt, startOfShanghaiDay(now)),
          ),
        )
    )[0];
    if ((today?.value ?? 0) > (await this.rulesService.rules()).postDailyXpLimit) {
      return 0;
    }
    return await this.awardXp(userId, (await this.rulesService.rules()).postXp, 'post', now);
  }

  async awardReplyXp(userId: string, now = new Date()): Promise<number> {
    const today = (
      await this.db.db
        .select({ value: count() })
        .from(replyTable)
        .where(
          and(
            eq(replyTable.authorId, userId),
            eq(replyTable.status, 'published'),
            gte(replyTable.createdAt, startOfShanghaiDay(now)),
          ),
        )
    )[0];
    if ((today?.value ?? 0) > (await this.rulesService.rules()).replyDailyXpLimit) {
      return 0;
    }
    return await this.awardXp(userId, (await this.rulesService.rules()).replyXp, 'reply', now);
  }

  async capeUnlocked(userId: string): Promise<boolean> {
    const row = (
      await this.db.db
        .select({ capeUnlockedAt: userProgress.capeUnlockedAt })
        .from(userProgress)
        .where(eq(userProgress.userId, userId))
    )[0];
    return row?.capeUnlockedAt != null;
  }

  async assertCapeUnlocked(userId: string): Promise<void> {
    if (!(await this.capeUnlocked(userId))) {
      throw new ForbiddenException(
        `披风功能尚未解锁，请在成长中心使用 ${(await this.rulesService.rules()).capeUnlockPrice} 积分解锁`,
      );
    }
  }
}
