import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import {
  GROWTH_RULES,
  LEVEL_MAX,
  XP_PER_LEVEL,
  buildShopItems,
  mergeGrowthRules,
  levelFromXp,
  tierForLevel,
  xpForLevel,
  type AdjustPointsResponse,
  type AdminBannerOverview,
  type AdminTitleOverview,
  type BannerSummary,
  type CheckinResponse,
  type CreateTitleRequest,
  type GrowthOverviewResponse,
  type GrowthRules,
  type GrowthRulesPatch,
  type GrowthRulesResponse,
  type LeaderboardEntry,
  type PointTransactionPage,
  type PointTransactionSummary,
  type PurchaseRequest,
  type PurchaseResponse,
  type ShopItem,
  type SubmitTitleApplicationRequest,
  type TipRequest,
  type TipResponse,
  type TitleApplicationSummary,
  type UserProgressSummary,
  type UserTitleSummary,
} from '@mcserauth/shared';
import { and, count, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { DbService, type CanonicalDb } from '../../db/db.service.js';
import {
  banner as bannerTable,
  dailyCheckin,
  notification,
  pointTransaction,
  post as postTable,
  reply as replyTable,
  siteSetting,
  title as titleTable,
  titleApplication,
  user as userTable,
  userProgress,
  userTitle,
  moderationLog,
} from '../../db/schema/index.js';
type ProgressRow = typeof userProgress.$inferSelect;
type TitleRow = typeof titleTable.$inferSelect;
type BannerRow = typeof bannerTable.$inferSelect;
type Tx = CanonicalDb;
const DAY_MS = 24 * 60 * 60 * 1000;
const GROWTH_RULES_KEY = 'growthRules';
const SPECIAL_TITLES = [
  { name: '赞助商', description: '为服务器与社区提供赞助支持', color: '#f59e0b' },
  { name: '合作伙伴', description: '长期协作的社区伙伴', color: '#0ea5e9' },
  { name: '友商', description: '友好互助的兄弟服务器', color: '#22c55e' },
] as const;
/** Chinese calendar day used for daily check-ins (server time zone independent). */
function dayKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
function shiftDay(day: string, offset: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const value = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1));
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}
function startOfShanghaiDay(now = new Date()): Date {
  return new Date(`${dayKey(now)}T00:00:00+08:00`);
}
function clampText(value: string | undefined, max: number): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed.slice(0, max);
}
function toTitleSummary(row: TitleRow): UserTitleSummary {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    description: row.description,
    color: row.color,
  };
}
/**
 * Levels, XP, points, check-in, shop purchases, tips, titles and banners.
 *
 * All balance mutations run inside SQLite transactions and append a ledger row
 * so points never change without an audit trail.
 */
@Injectable()
export class ProgressService implements OnModuleInit {
  private readonly logger = new Logger(ProgressService.name);
  private rulesCache: GrowthRules | null = null;
  constructor(private readonly db: DbService) {}
  async onModuleInit(): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const item of SPECIAL_TITLES) {
        await this.db.insertIgnore(
          titleTable,
          { name: item.name, description: item.description, color: item.color },
          tx,
        );
      }
    });
    this.logger.log(`Ensured ${SPECIAL_TITLES.length} special titles`);
  }
  // -------------------------------------------------------------------- rules
  /**
   * Effective economy values: shipped defaults merged with the single stored
   * override row. Cached because the only writer is this service.
   */
  async rules(): Promise<GrowthRules> {
    if (this.rulesCache !== null) {
      return this.rulesCache;
    }
    const row = (
      await this.db.db.select().from(siteSetting).where(eq(siteSetting.key, GROWTH_RULES_KEY))
    )[0];
    let patch: GrowthRulesPatch | null = null;
    if (row !== undefined) {
      try {
        patch = JSON.parse(row.value) as GrowthRulesPatch;
      } catch {
        this.logger.warn('growthRules setting is not valid JSON; using defaults');
      }
    }
    try {
      this.rulesCache = mergeGrowthRules(patch);
    } catch {
      this.logger.warn('growthRules setting failed validation; using defaults');
      this.rulesCache = { ...GROWTH_RULES };
    }
    return this.rulesCache;
  }
  async shopItems(): Promise<ShopItem[]> {
    return buildShopItems(await this.rules());
  }
  async rulesView(): Promise<GrowthRulesResponse> {
    const row = (
      await this.db.db
        .select({ key: siteSetting.key })
        .from(siteSetting)
        .where(eq(siteSetting.key, GROWTH_RULES_KEY))
    )[0];
    return {
      rules: await this.rules(),
      defaults: { ...GROWTH_RULES },
      customized: row !== undefined,
    };
  }
  async updateRules(actorId: string, patch: GrowthRulesPatch): Promise<GrowthRulesResponse> {
    const merged = mergeGrowthRules(patch);
    const value = JSON.stringify(merged);
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await this.db.upsert(
        siteSetting,
        { key: GROWTH_RULES_KEY, value, updatedBy: actorId },
        {
          target: siteSetting.key,
          set: { value, updatedAt: now, updatedBy: actorId },
        },
        tx,
      );
      await tx.insert(moderationLog).values({
        actorId,
        action: 'update_site',
        targetType: 'site',
        targetId: 'growth_rules',
        reason: `checkinXp=${merged.checkinBaseXp} postXp=${merged.postXp} boostPrice=${merged.xpBoostPrice}`,
      });
    });
    this.rulesCache = merged;
    return await this.rulesView();
  }
  async resetRules(actorId: string): Promise<GrowthRulesResponse> {
    await this.db.transaction(async (tx) => {
      await tx.delete(siteSetting).where(eq(siteSetting.key, GROWTH_RULES_KEY));
      await tx.insert(moderationLog).values({
        actorId,
        action: 'update_site',
        targetType: 'site',
        targetId: 'growth_rules',
        reason: 'reset to defaults',
      });
    });
    this.rulesCache = null;
    return await this.rulesView();
  }
  // ------------------------------------------------------------------ progress
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
  /** Batch wallet lookup for admin user lists. */
  async walletsFor(userIds: string[]): Promise<Map<string, number>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) {
      return new Map();
    }
    return new Map(
      (
        await this.db.db
          .select({ userId: userProgress.userId, points: userProgress.points })
          .from(userProgress)
          .where(inArray(userProgress.userId, unique))
      ).map((row) => [row.userId, row.points]),
    );
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
    const awarded = Math.floor(baseXp * (boosted ? (await this.rules()).xpBoostMultiplier : 1));
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
    if ((today?.value ?? 0) > (await this.rules()).postDailyXpLimit) {
      return 0;
    }
    return await this.awardXp(userId, (await this.rules()).postXp, 'post', now);
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
    if ((today?.value ?? 0) > (await this.rules()).replyDailyXpLimit) {
      return 0;
    }
    return await this.awardXp(userId, (await this.rules()).replyXp, 'reply', now);
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
        `披风功能尚未解锁，请在成长中心使用 ${(await this.rules()).capeUnlockPrice} 积分解锁`,
      );
    }
  }
  // ------------------------------------------------------------------ check-in
  async checkin(userId: string, now = new Date()): Promise<CheckinResponse> {
    const today = dayKey(now);
    const row = await this.ensure(userId);
    if (row.lastCheckinOn === today) {
      throw new ConflictException('今天已经签到过了，明天再来');
    }
    const streak = row.lastCheckinOn === shiftDay(today, -1) ? row.checkinStreak + 1 : 1;
    const xpBase =
      (await this.rules()).checkinBaseXp +
      Math.min(Math.max(0, streak - 1), (await this.rules()).checkinStreakXpCap) *
        (await this.rules()).checkinStreakXp;
    const points =
      (await this.rules()).checkinBasePoints +
      Math.min(Math.max(0, streak - 1), (await this.rules()).checkinStreakPointsCap) *
        (await this.rules()).checkinStreakPoints;
    const boosted = row.xpBoostUntil !== null && row.xpBoostUntil.getTime() > now.getTime();
    // A special title opts the account out of the level ladder, but the daily
    // check-in and its points still count.
    const xpAwarded = (await this.hasSpecialTitle(userId))
      ? 0
      : Math.floor(xpBase * (boosted ? (await this.rules()).xpBoostMultiplier : 1));
    await this.db.transaction(async (tx) => {
      await tx
        .insert(dailyCheckin)
        .values({ userId, checkinOn: today, streak, xpAwarded, pointsAwarded: points });
      const xp = Math.min(LEVEL_MAX * XP_PER_LEVEL, row.xp + xpAwarded);
      const balanceAfter = row.points + points;
      await tx
        .update(userProgress)
        .set({
          xp,
          level: levelFromXp(xp),
          points: balanceAfter,
          checkinStreak: streak,
          lastCheckinOn: today,
          totalCheckins: row.totalCheckins + 1,
          updatedAt: now,
        })
        .where(eq(userProgress.userId, userId));
      await tx.insert(pointTransaction).values({
        userId,
        amount: points,
        balanceAfter,
        reason: 'checkin',
        memo: `连续签到 ${streak} 天`,
        refId: today,
      });
    });
    return {
      progress: await this.summary(userId, now),
      xpAwarded,
      pointsAwarded: points,
      streak,
    };
  }
  // ------------------------------------------------------------------ shop
  async purchase(
    userId: string,
    input: PurchaseRequest,
    now = new Date(),
  ): Promise<PurchaseResponse> {
    const item = (await this.shopItems()).find((entry) => entry.key === input.item);
    if (!item) {
      throw new BadRequestException('商品不存在');
    }
    const row = await this.ensure(userId);
    if (row.points < item.price) {
      throw new BadRequestException(`积分不足，需要 ${item.price} 积分（当前 ${row.points}）`);
    }
    if (item.key === 'xp_boost') {
      const base =
        row.xpBoostUntil !== null && row.xpBoostUntil.getTime() > now.getTime()
          ? row.xpBoostUntil
          : now;
      const until = new Date(base.getTime() + (await this.rules()).xpBoostHours * 60 * 60 * 1000);
      await this.db.transaction(async (tx) => {
        const balance = await this.applyPoints(tx, userId, -item.price, row.points, 'xp_boost', {
          memo: `经验翻倍卡 ${(await this.rules()).xpBoostHours} 小时`,
        });
        await tx
          .update(userProgress)
          .set({ points: balance, xpBoostUntil: until, updatedAt: now })
          .where(eq(userProgress.userId, userId));
      });
      return {
        progress: await this.summary(userId, now),
        message: `经验翻倍已生效，持续到 ${until.toLocaleString('zh-CN', { hour12: false })}`,
        banner: null,
      };
    }
    if (item.key === 'cape_unlock') {
      if (row.capeUnlockedAt !== null) {
        throw new ConflictException('披风功能已经解锁');
      }
      await this.db.transaction(async (tx) => {
        const balance = await this.applyPoints(tx, userId, -item.price, row.points, 'cape_unlock', {
          memo: '永久解锁披风功能',
        });
        await tx
          .update(userProgress)
          .set({ points: balance, capeUnlockedAt: now, updatedAt: now })
          .where(eq(userProgress.userId, userId));
      });
      return {
        progress: await this.summary(userId, now),
        message: '披风功能已解锁，前往游戏账号管理上传披风吧',
        banner: null,
      };
    }
    const title = input.bannerTitle?.trim() ?? '';
    if (title.length < 2 || title.length > 40) {
      throw new BadRequestException('Banner 标题需要 2–40 个字符');
    }
    const href = input.bannerHref?.trim() ?? '';
    if (href !== '' && !/^https?:\/\//i.test(href)) {
      throw new BadRequestException('Banner 链接必须以 http:// 或 https:// 开头');
    }
    const description = clampText(input.bannerDescription, 120);
    const created = await this.db.transaction(async (tx) => {
      const balance = await this.applyPoints(tx, userId, -item.price, row.points, 'banner', {
        memo: `Banner 申请：${title}`,
      });
      await tx
        .update(userProgress)
        .set({ points: balance, updatedAt: now })
        .where(eq(userProgress.userId, userId));
      const [inserted] = await this.db.insertReturning(
        bannerTable,
        {
          userId,
          title,
          description,
          href: href === '' ? null : href,
          status: 'pending',
          pointsSpent: item.price,
        },
        tx,
      );
      if (inserted === undefined) {
        throw new Error('Failed to create banner application.');
      }
      return inserted;
    });
    const owner = (
      await this.db.db
        .select({ name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, userId))
    )[0];
    return {
      progress: await this.summary(userId, now),
      message: 'Banner 申请已提交，审核通过后会在首页展示',
      banner: this.toBannerSummary(created, owner?.name ?? ''),
    };
  }
  async tip(fromUserId: string, input: TipRequest): Promise<TipResponse> {
    if (input.userId === fromUserId) {
      throw new BadRequestException('不能打赏自己');
    }
    const amount = Math.floor(input.amount);
    if (amount < (await this.rules()).tipMin || amount > (await this.rules()).tipMax) {
      throw new BadRequestException(
        `打赏积分需要在 ${(await this.rules()).tipMin}–${(await this.rules()).tipMax} 之间`,
      );
    }
    const recipient = (
      await this.db.db
        .select({ id: userTable.id, name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, input.userId))
    )[0];
    if (!recipient) {
      throw new NotFoundException('被打赏的用户不存在');
    }
    const sender = (
      await this.db.db
        .select({ id: userTable.id, name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, fromUserId))
    )[0];
    const senderRow = await this.ensure(fromUserId);
    if (senderRow.points < amount) {
      throw new BadRequestException(`积分不足（当前 ${senderRow.points}）`);
    }
    const recipientRow = await this.ensure(recipient.id);
    await this.db.transaction(async (tx) => {
      const senderBalance = await this.applyPoints(
        tx,
        fromUserId,
        -amount,
        senderRow.points,
        'tip_out',
        {
          memo: input.memo ?? `打赏给 ${recipient.name}`,
          refId: recipient.id,
        },
      );
      await tx
        .update(userProgress)
        .set({ points: senderBalance, updatedAt: new Date() })
        .where(eq(userProgress.userId, fromUserId));
      const recipientBalance = await this.applyPoints(
        tx,
        recipient.id,
        amount,
        recipientRow.points,
        'tip_in',
        { memo: input.memo ?? `来自 ${sender?.name ?? '社区成员'} 的打赏`, refId: fromUserId },
      );
      await tx
        .update(userProgress)
        .set({ points: recipientBalance, updatedAt: new Date() })
        .where(eq(userProgress.userId, recipient.id));
      await tx.insert(notification).values({
        userId: recipient.id,
        type: 'system',
        actorId: fromUserId,
        message: `${sender?.name ?? '社区成员'} 打赏了你 ${amount} 积分`,
        link: '/forum/growth',
      });
    });
    const recipientAfter = await this.summary(recipient.id);
    return {
      progress: await this.summary(fromUserId),
      recipient: { userId: recipient.id, name: recipient.name, points: recipientAfter.points },
    };
  }
  async listTransactions(userId: string, page = 1, pageSize = 20): Promise<PointTransactionPage> {
    const safePage = Math.max(1, page);
    const safeSize = Math.min(50, Math.max(1, pageSize));
    const rows = await this.db.db
      .select()
      .from(pointTransaction)
      .where(eq(pointTransaction.userId, userId))
      .orderBy(desc(pointTransaction.createdAt), desc(pointTransaction.id))
      .limit(safeSize)
      .offset((safePage - 1) * safeSize);
    const total = (
      await this.db.db
        .select({ value: count() })
        .from(pointTransaction)
        .where(eq(pointTransaction.userId, userId))
    )[0];
    return {
      items: rows.map((row) => this.toTransaction(row)),
      total: total?.value ?? 0,
      page: safePage,
      pageSize: safeSize,
    };
  }
  async overview(userId: string): Promise<GrowthOverviewResponse> {
    return {
      progress: await this.summary(userId),
      shop: await this.shopItems(),
      rules: await this.rules(),
      titles: await this.listTitles(),
      leaderboard: await this.leaderboard(10),
      banners: (await this.listOwnBanners(userId)).slice(0, 5),
      latestTransactions: (await this.listTransactions(userId, 1, 8)).items,
      pendingTitleApplication: await this.pendingApplication(userId),
    };
  }
  // ------------------------------------------------------------------ titles
  async listTitles(): Promise<UserTitleSummary[]> {
    return (
      await this.db.db.select().from(titleTable).orderBy(titleTable.kind, desc(titleTable.id))
    ).map(toTitleSummary);
  }
  async submitTitleApplication(
    userId: string,
    input: SubmitTitleApplicationRequest,
  ): Promise<TitleApplicationSummary> {
    const progress = await this.summary(userId);
    if (progress.level < (await this.rules()).titleApplicationLevel) {
      throw new ForbiddenException(
        `达到 ${(await this.rules()).titleApplicationLevel} 级后才能申请专属称号`,
      );
    }
    if (progress.title !== null) {
      throw new ConflictException('你已经拥有称号');
    }
    const pending = await this.pendingApplication(userId);
    if (pending) {
      throw new ConflictException('已有待审核的称号申请');
    }
    const proposedName = input.proposedName.trim();
    if (proposedName.length < 2 || proposedName.length > 20) {
      throw new BadRequestException('称号名称需要 2–20 个字符');
    }
    const reason = input.reason.trim();
    if (reason.length < 5 || reason.length > 300) {
      throw new BadRequestException('申请理由需要 5–300 个字符');
    }
    const nameTaken = (
      await this.db.db
        .select({ id: titleTable.id })
        .from(titleTable)
        .where(eq(titleTable.name, proposedName))
    )[0];
    if (nameTaken) {
      throw new ConflictException('该称号名称已被使用');
    }
    const [created] = await this.db.insertReturning(titleApplication, {
      userId,
      proposedName,
      reason,
    });
    if (created === undefined) {
      throw new Error('Failed to create title application.');
    }
    return await this.toApplicationSummary(created);
  }
  async pendingApplication(userId: string): Promise<TitleApplicationSummary | null> {
    const row = (
      await this.db.db
        .select()
        .from(titleApplication)
        .where(and(eq(titleApplication.userId, userId), eq(titleApplication.status, 'pending')))
        .orderBy(desc(titleApplication.createdAt))
    )[0];
    return row ? await this.toApplicationSummary(row) : null;
  }
  // ------------------------------------------------------------------ banners
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
      .orderBy(desc(bannerTable.startsAt), desc(bannerTable.id))
      .limit(Math.min((await this.rules()).bannerMaxActive, Math.max(1, limit)));
    return rows.map((row) => this.toBannerSummary(row.banner, row.ownerName));
  }
  async listOwnBanners(userId: string): Promise<BannerSummary[]> {
    return (
      await this.db.db
        .select({ banner: bannerTable, ownerName: userTable.name })
        .from(bannerTable)
        .innerJoin(userTable, eq(bannerTable.userId, userTable.id))
        .where(eq(bannerTable.userId, userId))
        .orderBy(desc(bannerTable.createdAt))
    ).map((row) => this.toBannerSummary(row.banner, row.ownerName));
  }
  async leaderboard(limit = 10): Promise<LeaderboardEntry[]> {
    const capped = Math.min(50, Math.max(1, limit));
    const rows = await this.db.db
      .select({ progress: userProgress, name: userTable.name, avatarUrl: userTable.avatarUrl })
      .from(userProgress)
      .innerJoin(userTable, eq(userProgress.userId, userTable.id))
      .orderBy(desc(userProgress.xp), desc(userProgress.updatedAt))
      .limit(capped * 3);
    if (rows.length === 0) {
      return [];
    }
    // Only special titles leave the ladder; custom titles were earned on it.
    const exempt = new Set(
      (
        await this.db.db
          .select({ userId: userTitle.userId })
          .from(userTitle)
          .innerJoin(titleTable, eq(userTitle.titleId, titleTable.id))
          .where(
            and(
              inArray(
                userTitle.userId,
                rows.map((row) => row.progress.userId),
              ),
              eq(titleTable.kind, 'special'),
            ),
          )
      ).map((row) => row.userId),
    );
    return rows
      .filter((row) => !exempt.has(row.progress.userId))
      .slice(0, capped)
      .map((row) => {
        const level = levelFromXp(row.progress.xp);
        return {
          userId: row.progress.userId,
          name: row.name,
          avatarUrl: row.avatarUrl,
          level,
          xp: row.progress.xp,
          tierName: tierForLevel(level).name,
          title: null,
        };
      });
  }
  // ------------------------------------------------------------- admin: titles
  async adminTitleOverview(): Promise<AdminTitleOverview> {
    const titles = await this.db.db.select().from(titleTable).orderBy(desc(titleTable.id));
    const grants = await this.db.db
      .select({ titleId: userTitle.titleId, userId: userTitle.userId, name: userTable.name })
      .from(userTitle)
      .innerJoin(userTable, eq(userTitle.userId, userTable.id));
    const applications = await this.db.db
      .select({ application: titleApplication, name: userTable.name })
      .from(titleApplication)
      .innerJoin(userTable, eq(titleApplication.userId, userTable.id))
      .orderBy(desc(titleApplication.createdAt))
      .limit(50);
    return {
      titles: titles.map((row) => ({
        ...toTitleSummary(row),
        holders: grants
          .filter((grant) => grant.titleId === row.id)
          .map((grant) => ({ userId: grant.userId, name: grant.name })),
      })),
      applications: await Promise.all(
        applications.map(async (row) => await this.toApplicationSummary(row.application, row.name)),
      ),
    };
  }
  async createSpecialTitle(actorId: string, input: CreateTitleRequest): Promise<UserTitleSummary> {
    const name = input.name.trim();
    if (name.length < 2 || name.length > 20) {
      throw new BadRequestException('称号名称需要 2–20 个字符');
    }
    const color = input.color?.trim() ?? '#8b5cf6';
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      throw new BadRequestException('颜色必须是 #RRGGBB');
    }
    const existing = (
      await this.db.db
        .select({ id: titleTable.id })
        .from(titleTable)
        .where(eq(titleTable.name, name))
    )[0];
    if (existing) {
      throw new ConflictException('该称号名称已存在');
    }
    const [created] = await this.db.insertReturning(titleTable, {
      name,
      kind: 'special',
      description: clampText(input.description ?? undefined, 200),
      color,
      createdBy: actorId,
    });
    if (created === undefined) {
      throw new Error('Failed to create title.');
    }
    await this.log(actorId, 'grant_title', `created title ${name}`);
    return toTitleSummary(created);
  }
  async grantTitle(actorId: string, titleId: number, userId: string): Promise<void> {
    const titleRow = (
      await this.db.db.select().from(titleTable).where(eq(titleTable.id, titleId))
    )[0];
    if (!titleRow) {
      throw new NotFoundException('称号不存在');
    }
    const target = (
      await this.db.db
        .select({ id: userTable.id, name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, userId))
    )[0];
    if (!target) {
      throw new NotFoundException('用户不存在');
    }
    const existing = (
      await this.db.db
        .select({ id: userTitle.id })
        .from(userTitle)
        .where(and(eq(userTitle.userId, userId), eq(userTitle.titleId, titleId)))
    )[0];
    if (existing) {
      throw new ConflictException('该用户已拥有此称号');
    }
    await this.db.transaction(async (tx) => {
      await tx.insert(userTitle).values({ userId, titleId, grantedBy: actorId });
      await tx.insert(notification).values({
        userId,
        type: 'system',
        actorId,
        message: `你获得了称号「${titleRow.name}」`,
        link: '/forum/growth',
      });
      await tx.insert(moderationLog).values({
        actorId,
        action: 'grant_title',
        targetType: 'user',
        targetId: userId,
        reason: `title=${titleRow.name}`,
      });
    });
  }
  async revokeTitle(actorId: string, titleId: number, userId: string): Promise<void> {
    const deleted = await this.db.db
      .delete(userTitle)
      .where(and(eq(userTitle.userId, userId), eq(userTitle.titleId, titleId)));
    if (this.db.affectedRows(deleted) === 0) {
      throw new NotFoundException('该用户没有此称号');
    }
    await this.log(actorId, 'revoke_title', `user=${userId} title=${titleId}`);
  }
  async reviewTitleApplication(
    actorId: string,
    id: number,
    approve: boolean,
  ): Promise<TitleApplicationSummary> {
    const row = (
      await this.db.db.select().from(titleApplication).where(eq(titleApplication.id, id))
    )[0];
    if (!row) {
      throw new NotFoundException('称号申请不存在');
    }
    if (row.status !== 'pending') {
      throw new ConflictException('该申请已处理');
    }
    const now = new Date();
    let createdTitle: TitleRow | null = null;
    await this.db.transaction(async (tx) => {
      if (approve) {
        const nameTaken = (
          await tx
            .select({ id: titleTable.id })
            .from(titleTable)
            .where(eq(titleTable.name, row.proposedName))
        )[0];
        if (nameTaken) {
          throw new ConflictException('称号名称已被占用，请驳回后让用户重新申请');
        }
        const [inserted] = await this.db.insertReturning(
          titleTable,
          {
            name: row.proposedName,
            kind: 'custom',
            description: row.reason.slice(0, 200),
            color: '#facc15',
            createdBy: actorId,
          },
          tx,
        );
        if (inserted === undefined) {
          throw new Error('Failed to create title.');
        }
        createdTitle = inserted;
        await this.db.insertIgnore(
          userTitle,
          { userId: row.userId, titleId: inserted.id, grantedBy: actorId },
          tx,
        );
      }
      await tx
        .update(titleApplication)
        .set({
          status: approve ? 'approved' : 'rejected',
          resultTitleId: createdTitle?.id ?? null,
          reviewedBy: actorId,
          reviewedAt: now,
        })
        .where(eq(titleApplication.id, id));
      await tx.insert(notification).values({
        userId: row.userId,
        type: 'system',
        actorId,
        message: approve
          ? `你的专属称号「${row.proposedName}」已通过审核`
          : '你的专属称号申请未通过审核',
        link: '/forum/growth',
      });
      await tx.insert(moderationLog).values({
        actorId,
        action: 'review_title_application',
        targetType: 'title_application',
        targetId: String(id),
        reason: approve ? 'approved' : 'rejected',
      });
    });
    const updated = (
      await this.db.db.select().from(titleApplication).where(eq(titleApplication.id, id))
    )[0];
    return await this.toApplicationSummary(updated ?? row);
  }
  // ------------------------------------------------------------ admin: banners
  async adminBanners(status?: BannerRow['status']): Promise<AdminBannerOverview> {
    const rows = await this.db.db
      .select({ banner: bannerTable, ownerName: userTable.name })
      .from(bannerTable)
      .innerJoin(userTable, eq(bannerTable.userId, userTable.id))
      .where(status === undefined ? undefined : eq(bannerTable.status, status))
      .orderBy(desc(bannerTable.createdAt))
      .limit(100);
    return { banners: rows.map((row) => this.toBannerSummary(row.banner, row.ownerName)) };
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
    const endsAt = new Date(now.getTime() + (await this.rules()).bannerDays * DAY_MS);
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
        const balance = await this.applyPoints(
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
          ? `你的 Banner「${row.title}」已通过审核，将在首页展示 ${(await this.rules()).bannerDays} 天`
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
    return this.toBannerSummary(updated ?? row, owner?.name ?? '');
  }
  // ------------------------------------------------------------- admin: points
  async adjustPoints(
    actorId: string,
    userId: string,
    amount: number,
    memo?: string,
  ): Promise<AdjustPointsResponse> {
    if (!Number.isInteger(amount) || amount === 0) {
      throw new BadRequestException('积分调整必须是非零整数');
    }
    if (Math.abs(amount) > 100000) {
      throw new BadRequestException('单次积分调整不能超过 100000');
    }
    const target = (
      await this.db.db
        .select({ id: userTable.id, name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, userId))
    )[0];
    if (!target) {
      throw new NotFoundException('用户不存在');
    }
    const row = await this.ensure(userId);
    if (row.points + amount < 0) {
      throw new BadRequestException('扣减后积分不能为负数');
    }
    const created = await this.db.transaction(async (tx) => {
      const balance = await this.applyPoints(tx, userId, amount, row.points, 'admin_adjust', {
        memo: memo ?? '管理员调整',
        refId: actorId,
      });
      await tx
        .update(userProgress)
        .set({ points: balance, updatedAt: new Date() })
        .where(eq(userProgress.userId, userId));
      await tx.insert(notification).values({
        userId,
        type: 'system',
        actorId,
        message:
          amount > 0 ? `管理员向你赠送了 ${amount} 积分` : `管理员扣除了 ${Math.abs(amount)} 积分`,
        link: '/forum/growth',
      });
      await tx.insert(moderationLog).values({
        actorId,
        action: 'adjust_points',
        targetType: 'user',
        targetId: userId,
        reason: `${amount > 0 ? '+' : ''}${amount}${memo ? ` ${memo}` : ''}`,
      });
      return (
        await tx
          .select()
          .from(pointTransaction)
          .where(eq(pointTransaction.userId, userId))
          .orderBy(desc(pointTransaction.id))
          .limit(1)
      )[0];
    });
    return {
      userId,
      points: (await this.ensure(userId)).points,
      transaction: created
        ? this.toTransaction(created)
        : {
            id: 0,
            amount,
            balanceAfter: row.points + amount,
            reason: 'admin_adjust',
            memo: memo ?? null,
            createdAt: new Date().toISOString(),
          },
    };
  }
  // --------------------------------------------------------------- helpers
  private async applyPoints(
    tx: Tx,
    userId: string,
    amount: number,
    currentBalance: number,
    reason: PointTransactionSummary['reason'],
    extra: {
      memo?: string;
      refId?: string;
    } = {},
  ): Promise<number> {
    const balanceAfter = currentBalance + amount;
    if (balanceAfter < 0) {
      throw new BadRequestException('积分不足');
    }
    await tx.insert(pointTransaction).values({
      userId,
      amount,
      balanceAfter,
      reason,
      memo: extra.memo ?? null,
      refId: extra.refId ?? null,
    });
    return balanceAfter;
  }
  private toTransaction(row: typeof pointTransaction.$inferSelect): PointTransactionSummary {
    return {
      id: row.id,
      amount: row.amount,
      balanceAfter: row.balanceAfter,
      reason: row.reason,
      memo: row.memo,
      createdAt: row.createdAt.toISOString(),
    };
  }
  private async toApplicationSummary(
    row: typeof titleApplication.$inferSelect,
    userName = '',
  ): Promise<TitleApplicationSummary> {
    const user = (
      await this.db.db
        .select({ name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, row.userId))
    )[0];
    const resultTitle =
      row.resultTitleId === null
        ? null
        : ((
            await this.db.db.select().from(titleTable).where(eq(titleTable.id, row.resultTitleId))
          )[0] ?? null);
    return {
      id: row.id,
      userId: row.userId,
      userName: userName !== '' ? userName : (user?.name ?? ''),
      proposedName: row.proposedName,
      reason: row.reason,
      status: row.status,
      resultTitle: resultTitle ? toTitleSummary(resultTitle) : null,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
  private toBannerSummary(row: BannerRow, ownerName: string): BannerSummary {
    return {
      id: row.id,
      userId: row.userId,
      ownerName,
      title: row.title,
      description: row.description,
      href: row.href,
      status: row.status,
      startsAt: row.startsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
  private async log(
    actorId: string,
    action: 'grant_title' | 'revoke_title',
    reason: string,
  ): Promise<void> {
    await this.db.db
      .insert(moderationLog)
      .values({ actorId, action, targetType: 'title', targetId: '0', reason });
  }
}
