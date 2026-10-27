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
import { DbService } from '../../db/db.service.js';
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
type Tx = Parameters<Parameters<DbService['db']['transaction']>[0]>[0];

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

  onModuleInit(): void {
    this.db.db.transaction((tx) => {
      for (const item of SPECIAL_TITLES) {
        tx.insert(titleTable)
          .values({ name: item.name, description: item.description, color: item.color })
          .onConflictDoNothing()
          .run();
      }
    });
    this.logger.log(`Ensured ${SPECIAL_TITLES.length} special titles`);
  }

  // -------------------------------------------------------------------- rules

  /**
   * Effective economy values: shipped defaults merged with the single stored
   * override row. Cached because the only writer is this service.
   */
  rules(): GrowthRules {
    if (this.rulesCache !== null) {
      return this.rulesCache;
    }
    const row = this.db.db
      .select()
      .from(siteSetting)
      .where(eq(siteSetting.key, GROWTH_RULES_KEY))
      .get();
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

  shopItems(): ShopItem[] {
    return buildShopItems(this.rules());
  }

  rulesView(): GrowthRulesResponse {
    const row = this.db.db
      .select({ key: siteSetting.key })
      .from(siteSetting)
      .where(eq(siteSetting.key, GROWTH_RULES_KEY))
      .get();
    return {
      rules: this.rules(),
      defaults: { ...GROWTH_RULES },
      customized: row !== undefined,
    };
  }

  updateRules(actorId: string, patch: GrowthRulesPatch): GrowthRulesResponse {
    const merged = mergeGrowthRules(patch);
    const value = JSON.stringify(merged);
    const now = new Date();
    this.db.db.transaction((tx) => {
      tx.insert(siteSetting)
        .values({ key: GROWTH_RULES_KEY, value, updatedBy: actorId })
        .onConflictDoUpdate({
          target: siteSetting.key,
          set: { value, updatedAt: now, updatedBy: actorId },
        })
        .run();
      tx.insert(moderationLog)
        .values({
          actorId,
          action: 'update_site',
          targetType: 'site',
          targetId: 'growth_rules',
          reason: `checkinXp=${merged.checkinBaseXp} postXp=${merged.postXp} boostPrice=${merged.xpBoostPrice}`,
        })
        .run();
    });
    this.rulesCache = merged;
    return this.rulesView();
  }

  resetRules(actorId: string): GrowthRulesResponse {
    this.db.db.transaction((tx) => {
      tx.delete(siteSetting).where(eq(siteSetting.key, GROWTH_RULES_KEY)).run();
      tx.insert(moderationLog)
        .values({
          actorId,
          action: 'update_site',
          targetType: 'site',
          targetId: 'growth_rules',
          reason: 'reset to defaults',
        })
        .run();
    });
    this.rulesCache = null;
    return this.rulesView();
  }

  // ------------------------------------------------------------------ progress

  ensure(userId: string): ProgressRow {
    const existing = this.db.db
      .select()
      .from(userProgress)
      .where(eq(userProgress.userId, userId))
      .get();
    if (existing) {
      return existing;
    }
    this.db.db.insert(userProgress).values({ userId }).onConflictDoNothing().run();
    const created = this.db.db
      .select()
      .from(userProgress)
      .where(eq(userProgress.userId, userId))
      .get();
    if (!created) {
      throw new NotFoundException('账号不存在');
    }
    return created;
  }

  summary(userId: string, now = new Date()): UserProgressSummary {
    const row = this.ensure(userId);
    const level = levelFromXp(row.xp);
    const tier = tierForLevel(level);
    const title = this.activeTitle(userId);
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
  hasSpecialTitle(userId: string): boolean {
    const row = this.db.db
      .select({ id: titleTable.id })
      .from(userTitle)
      .innerJoin(titleTable, eq(userTitle.titleId, titleTable.id))
      .where(and(eq(userTitle.userId, userId), eq(titleTable.kind, 'special')))
      .get();
    return row !== undefined;
  }

  activeTitle(userId: string): UserTitleSummary | null {
    const row = this.db.db
      .select({ title: titleTable })
      .from(userTitle)
      .innerJoin(titleTable, eq(userTitle.titleId, titleTable.id))
      .where(eq(userTitle.userId, userId))
      .orderBy(desc(userTitle.grantedAt), desc(userTitle.id))
      .get();
    return row ? toTitleSummary(row.title) : null;
  }

  /** Batch badge lookup for forum authors; title holders hide their level. */
  badgesFor(
    userIds: string[],
  ): Map<
    string,
    { level: number | null; levelTier: string | null; title: UserTitleSummary | null }
  > {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) {
      return new Map();
    }
    const progress = this.db.db
      .select()
      .from(userProgress)
      .where(inArray(userProgress.userId, unique))
      .all();
    const titles = this.db.db
      .select({ userId: userTitle.userId, title: titleTable, grantedAt: userTitle.grantedAt })
      .from(userTitle)
      .innerJoin(titleTable, eq(userTitle.titleId, titleTable.id))
      .where(inArray(userTitle.userId, unique))
      .orderBy(desc(userTitle.grantedAt), desc(userTitle.id))
      .all();
    const titleMap = new Map<string, UserTitleSummary>();
    for (const row of titles) {
      if (!titleMap.has(row.userId)) {
        titleMap.set(row.userId, toTitleSummary(row.title));
      }
    }
    const progressMap = new Map(progress.map((row) => [row.userId, row]));

    const result = new Map<
      string,
      { level: number | null; levelTier: string | null; title: UserTitleSummary | null }
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
  walletsFor(userIds: string[]): Map<string, number> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) {
      return new Map();
    }
    return new Map(
      this.db.db
        .select({ userId: userProgress.userId, points: userProgress.points })
        .from(userProgress)
        .where(inArray(userProgress.userId, unique))
        .all()
        .map((row) => [row.userId, row.points]),
    );
  }

  awardXp(userId: string, baseXp: number, memo: string | null = null, now = new Date()): number {
    if (baseXp <= 0) {
      return 0;
    }
    if (this.hasSpecialTitle(userId)) {
      return 0;
    }
    const row = this.ensure(userId);
    const boosted = row.xpBoostUntil !== null && row.xpBoostUntil.getTime() > now.getTime();
    const awarded = Math.floor(baseXp * (boosted ? this.rules().xpBoostMultiplier : 1));
    const xp = Math.min(LEVEL_MAX * XP_PER_LEVEL, row.xp + awarded);
    this.db.db
      .update(userProgress)
      .set({ xp, level: levelFromXp(xp), updatedAt: now })
      .where(eq(userProgress.userId, userId))
      .run();
    if (memo !== null) {
      this.logger.debug(`+${awarded} XP (${memo}) -> ${userId}`);
    }
    return awarded;
  }

  awardPostXp(userId: string, now = new Date()): number {
    const today = this.db.db
      .select({ value: count() })
      .from(postTable)
      .where(
        and(
          eq(postTable.authorId, userId),
          eq(postTable.status, 'published'),
          gte(postTable.createdAt, startOfShanghaiDay(now)),
        ),
      )
      .get();
    if ((today?.value ?? 0) > this.rules().postDailyXpLimit) {
      return 0;
    }
    return this.awardXp(userId, this.rules().postXp, 'post', now);
  }

  awardReplyXp(userId: string, now = new Date()): number {
    const today = this.db.db
      .select({ value: count() })
      .from(replyTable)
      .where(
        and(
          eq(replyTable.authorId, userId),
          eq(replyTable.status, 'published'),
          gte(replyTable.createdAt, startOfShanghaiDay(now)),
        ),
      )
      .get();
    if ((today?.value ?? 0) > this.rules().replyDailyXpLimit) {
      return 0;
    }
    return this.awardXp(userId, this.rules().replyXp, 'reply', now);
  }

  capeUnlocked(userId: string): boolean {
    const row = this.db.db
      .select({ capeUnlockedAt: userProgress.capeUnlockedAt })
      .from(userProgress)
      .where(eq(userProgress.userId, userId))
      .get();
    return row?.capeUnlockedAt != null;
  }

  assertCapeUnlocked(userId: string): void {
    if (!this.capeUnlocked(userId)) {
      throw new ForbiddenException(
        `披风功能尚未解锁，请在成长中心使用 ${this.rules().capeUnlockPrice} 积分解锁`,
      );
    }
  }

  // ------------------------------------------------------------------ check-in

  checkin(userId: string, now = new Date()): CheckinResponse {
    const today = dayKey(now);
    const row = this.ensure(userId);
    if (row.lastCheckinOn === today) {
      throw new ConflictException('今天已经签到过了，明天再来');
    }
    const streak = row.lastCheckinOn === shiftDay(today, -1) ? row.checkinStreak + 1 : 1;
    const xpBase =
      this.rules().checkinBaseXp +
      Math.min(Math.max(0, streak - 1), this.rules().checkinStreakXpCap) *
        this.rules().checkinStreakXp;
    const points =
      this.rules().checkinBasePoints +
      Math.min(Math.max(0, streak - 1), this.rules().checkinStreakPointsCap) *
        this.rules().checkinStreakPoints;
    const boosted = row.xpBoostUntil !== null && row.xpBoostUntil.getTime() > now.getTime();
    // A special title opts the account out of the level ladder, but the daily
    // check-in and its points still count.
    const xpAwarded = this.hasSpecialTitle(userId)
      ? 0
      : Math.floor(xpBase * (boosted ? this.rules().xpBoostMultiplier : 1));

    this.db.db.transaction((tx) => {
      tx.insert(dailyCheckin)
        .values({ userId, checkinOn: today, streak, xpAwarded, pointsAwarded: points })
        .run();
      const xp = Math.min(LEVEL_MAX * XP_PER_LEVEL, row.xp + xpAwarded);
      const balanceAfter = row.points + points;
      tx.update(userProgress)
        .set({
          xp,
          level: levelFromXp(xp),
          points: balanceAfter,
          checkinStreak: streak,
          lastCheckinOn: today,
          totalCheckins: row.totalCheckins + 1,
          updatedAt: now,
        })
        .where(eq(userProgress.userId, userId))
        .run();
      tx.insert(pointTransaction)
        .values({
          userId,
          amount: points,
          balanceAfter,
          reason: 'checkin',
          memo: `连续签到 ${streak} 天`,
          refId: today,
        })
        .run();
    });

    return {
      progress: this.summary(userId, now),
      xpAwarded,
      pointsAwarded: points,
      streak,
    };
  }

  // ------------------------------------------------------------------ shop

  purchase(userId: string, input: PurchaseRequest, now = new Date()): PurchaseResponse {
    const item = this.shopItems().find((entry) => entry.key === input.item);
    if (!item) {
      throw new BadRequestException('商品不存在');
    }
    const row = this.ensure(userId);
    if (row.points < item.price) {
      throw new BadRequestException(`积分不足，需要 ${item.price} 积分（当前 ${row.points}）`);
    }

    if (item.key === 'xp_boost') {
      const base =
        row.xpBoostUntil !== null && row.xpBoostUntil.getTime() > now.getTime()
          ? row.xpBoostUntil
          : now;
      const until = new Date(base.getTime() + this.rules().xpBoostHours * 60 * 60 * 1000);
      this.db.db.transaction((tx) => {
        const balance = this.applyPoints(tx, userId, -item.price, row.points, 'xp_boost', {
          memo: `经验翻倍卡 ${this.rules().xpBoostHours} 小时`,
        });
        tx.update(userProgress)
          .set({ points: balance, xpBoostUntil: until, updatedAt: now })
          .where(eq(userProgress.userId, userId))
          .run();
      });
      return {
        progress: this.summary(userId, now),
        message: `经验翻倍已生效，持续到 ${until.toLocaleString('zh-CN', { hour12: false })}`,
        banner: null,
      };
    }

    if (item.key === 'cape_unlock') {
      if (row.capeUnlockedAt !== null) {
        throw new ConflictException('披风功能已经解锁');
      }
      this.db.db.transaction((tx) => {
        const balance = this.applyPoints(tx, userId, -item.price, row.points, 'cape_unlock', {
          memo: '永久解锁披风功能',
        });
        tx.update(userProgress)
          .set({ points: balance, capeUnlockedAt: now, updatedAt: now })
          .where(eq(userProgress.userId, userId))
          .run();
      });
      return {
        progress: this.summary(userId, now),
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

    const created = this.db.db.transaction((tx) => {
      const balance = this.applyPoints(tx, userId, -item.price, row.points, 'banner', {
        memo: `Banner 申请：${title}`,
      });
      tx.update(userProgress)
        .set({ points: balance, updatedAt: now })
        .where(eq(userProgress.userId, userId))
        .run();
      return tx
        .insert(bannerTable)
        .values({
          userId,
          title,
          description,
          href: href === '' ? null : href,
          status: 'pending',
          pointsSpent: item.price,
        })
        .returning()
        .get();
    });
    const owner = this.db.db
      .select({ name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .get();
    return {
      progress: this.summary(userId, now),
      message: 'Banner 申请已提交，审核通过后会在首页展示',
      banner: this.toBannerSummary(created, owner?.name ?? ''),
    };
  }

  tip(fromUserId: string, input: TipRequest): TipResponse {
    if (input.userId === fromUserId) {
      throw new BadRequestException('不能打赏自己');
    }
    const amount = Math.floor(input.amount);
    if (amount < this.rules().tipMin || amount > this.rules().tipMax) {
      throw new BadRequestException(
        `打赏积分需要在 ${this.rules().tipMin}–${this.rules().tipMax} 之间`,
      );
    }
    const recipient = this.db.db
      .select({ id: userTable.id, name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, input.userId))
      .get();
    if (!recipient) {
      throw new NotFoundException('被打赏的用户不存在');
    }
    const sender = this.db.db
      .select({ id: userTable.id, name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, fromUserId))
      .get();
    const senderRow = this.ensure(fromUserId);
    if (senderRow.points < amount) {
      throw new BadRequestException(`积分不足（当前 ${senderRow.points}）`);
    }
    const recipientRow = this.ensure(recipient.id);

    this.db.db.transaction((tx) => {
      const senderBalance = this.applyPoints(tx, fromUserId, -amount, senderRow.points, 'tip_out', {
        memo: input.memo ?? `打赏给 ${recipient.name}`,
        refId: recipient.id,
      });
      tx.update(userProgress)
        .set({ points: senderBalance, updatedAt: new Date() })
        .where(eq(userProgress.userId, fromUserId))
        .run();
      const recipientBalance = this.applyPoints(
        tx,
        recipient.id,
        amount,
        recipientRow.points,
        'tip_in',
        { memo: input.memo ?? `来自 ${sender?.name ?? '社区成员'} 的打赏`, refId: fromUserId },
      );
      tx.update(userProgress)
        .set({ points: recipientBalance, updatedAt: new Date() })
        .where(eq(userProgress.userId, recipient.id))
        .run();
      tx.insert(notification)
        .values({
          userId: recipient.id,
          type: 'system',
          actorId: fromUserId,
          message: `${sender?.name ?? '社区成员'} 打赏了你 ${amount} 积分`,
          link: '/forum/growth',
        })
        .run();
    });

    const recipientAfter = this.summary(recipient.id);
    return {
      progress: this.summary(fromUserId),
      recipient: { userId: recipient.id, name: recipient.name, points: recipientAfter.points },
    };
  }

  listTransactions(userId: string, page = 1, pageSize = 20): PointTransactionPage {
    const safePage = Math.max(1, page);
    const safeSize = Math.min(50, Math.max(1, pageSize));
    const rows = this.db.db
      .select()
      .from(pointTransaction)
      .where(eq(pointTransaction.userId, userId))
      .orderBy(desc(pointTransaction.createdAt), desc(pointTransaction.id))
      .limit(safeSize)
      .offset((safePage - 1) * safeSize)
      .all();
    const total = this.db.db
      .select({ value: count() })
      .from(pointTransaction)
      .where(eq(pointTransaction.userId, userId))
      .get();
    return {
      items: rows.map((row) => this.toTransaction(row)),
      total: total?.value ?? 0,
      page: safePage,
      pageSize: safeSize,
    };
  }

  overview(userId: string): GrowthOverviewResponse {
    return {
      progress: this.summary(userId),
      shop: this.shopItems(),
      rules: this.rules(),
      titles: this.listTitles(),
      leaderboard: this.leaderboard(10),
      banners: this.listOwnBanners(userId).slice(0, 5),
      latestTransactions: this.listTransactions(userId, 1, 8).items,
      pendingTitleApplication: this.pendingApplication(userId),
    };
  }

  // ------------------------------------------------------------------ titles

  listTitles(): UserTitleSummary[] {
    return this.db.db
      .select()
      .from(titleTable)
      .orderBy(titleTable.kind, desc(titleTable.id))
      .all()
      .map(toTitleSummary);
  }

  submitTitleApplication(
    userId: string,
    input: SubmitTitleApplicationRequest,
  ): TitleApplicationSummary {
    const progress = this.summary(userId);
    if (progress.level < this.rules().titleApplicationLevel) {
      throw new ForbiddenException(
        `达到 ${this.rules().titleApplicationLevel} 级后才能申请专属称号`,
      );
    }
    if (progress.title !== null) {
      throw new ConflictException('你已经拥有称号');
    }
    const pending = this.pendingApplication(userId);
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
    const nameTaken = this.db.db
      .select({ id: titleTable.id })
      .from(titleTable)
      .where(eq(titleTable.name, proposedName))
      .get();
    if (nameTaken) {
      throw new ConflictException('该称号名称已被使用');
    }
    const created = this.db.db
      .insert(titleApplication)
      .values({ userId, proposedName, reason })
      .returning()
      .get();
    return this.toApplicationSummary(created);
  }

  pendingApplication(userId: string): TitleApplicationSummary | null {
    const row = this.db.db
      .select()
      .from(titleApplication)
      .where(and(eq(titleApplication.userId, userId), eq(titleApplication.status, 'pending')))
      .orderBy(desc(titleApplication.createdAt))
      .get();
    return row ? this.toApplicationSummary(row) : null;
  }

  // ------------------------------------------------------------------ banners

  listActiveBanners(limit = 6, now = new Date()): BannerSummary[] {
    const rows = this.db.db
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
      .limit(Math.min(this.rules().bannerMaxActive, Math.max(1, limit)))
      .all();
    return rows.map((row) => this.toBannerSummary(row.banner, row.ownerName));
  }

  listOwnBanners(userId: string): BannerSummary[] {
    return this.db.db
      .select({ banner: bannerTable, ownerName: userTable.name })
      .from(bannerTable)
      .innerJoin(userTable, eq(bannerTable.userId, userTable.id))
      .where(eq(bannerTable.userId, userId))
      .orderBy(desc(bannerTable.createdAt))
      .all()
      .map((row) => this.toBannerSummary(row.banner, row.ownerName));
  }

  leaderboard(limit = 10): LeaderboardEntry[] {
    const capped = Math.min(50, Math.max(1, limit));
    const rows = this.db.db
      .select({ progress: userProgress, name: userTable.name, avatarUrl: userTable.avatarUrl })
      .from(userProgress)
      .innerJoin(userTable, eq(userProgress.userId, userTable.id))
      .orderBy(desc(userProgress.xp), desc(userProgress.updatedAt))
      .limit(capped * 3)
      .all();
    if (rows.length === 0) {
      return [];
    }
    // Only special titles leave the ladder; custom titles were earned on it.
    const exempt = new Set(
      this.db.db
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
        .all()
        .map((row) => row.userId),
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

  adminTitleOverview(): AdminTitleOverview {
    const titles = this.db.db.select().from(titleTable).orderBy(desc(titleTable.id)).all();
    const grants = this.db.db
      .select({ titleId: userTitle.titleId, userId: userTitle.userId, name: userTable.name })
      .from(userTitle)
      .innerJoin(userTable, eq(userTitle.userId, userTable.id))
      .all();
    const applications = this.db.db
      .select({ application: titleApplication, name: userTable.name })
      .from(titleApplication)
      .innerJoin(userTable, eq(titleApplication.userId, userTable.id))
      .orderBy(desc(titleApplication.createdAt))
      .limit(50)
      .all();
    return {
      titles: titles.map((row) => ({
        ...toTitleSummary(row),
        holders: grants
          .filter((grant) => grant.titleId === row.id)
          .map((grant) => ({ userId: grant.userId, name: grant.name })),
      })),
      applications: applications.map((row) => this.toApplicationSummary(row.application, row.name)),
    };
  }

  createSpecialTitle(actorId: string, input: CreateTitleRequest): UserTitleSummary {
    const name = input.name.trim();
    if (name.length < 2 || name.length > 20) {
      throw new BadRequestException('称号名称需要 2–20 个字符');
    }
    const color = input.color?.trim() ?? '#8b5cf6';
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      throw new BadRequestException('颜色必须是 #RRGGBB');
    }
    const existing = this.db.db
      .select({ id: titleTable.id })
      .from(titleTable)
      .where(eq(titleTable.name, name))
      .get();
    if (existing) {
      throw new ConflictException('该称号名称已存在');
    }
    const created = this.db.db
      .insert(titleTable)
      .values({
        name,
        kind: 'special',
        description: clampText(input.description ?? undefined, 200),
        color,
        createdBy: actorId,
      })
      .returning()
      .get();
    this.log(actorId, 'grant_title', `created title ${name}`);
    return toTitleSummary(created);
  }

  grantTitle(actorId: string, titleId: number, userId: string): void {
    const titleRow = this.db.db.select().from(titleTable).where(eq(titleTable.id, titleId)).get();
    if (!titleRow) {
      throw new NotFoundException('称号不存在');
    }
    const target = this.db.db
      .select({ id: userTable.id, name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .get();
    if (!target) {
      throw new NotFoundException('用户不存在');
    }
    const existing = this.db.db
      .select({ id: userTitle.id })
      .from(userTitle)
      .where(and(eq(userTitle.userId, userId), eq(userTitle.titleId, titleId)))
      .get();
    if (existing) {
      throw new ConflictException('该用户已拥有此称号');
    }
    this.db.db.transaction((tx) => {
      tx.insert(userTitle).values({ userId, titleId, grantedBy: actorId }).run();
      tx.insert(notification)
        .values({
          userId,
          type: 'system',
          actorId,
          message: `你获得了称号「${titleRow.name}」`,
          link: '/forum/growth',
        })
        .run();
      tx.insert(moderationLog)
        .values({
          actorId,
          action: 'grant_title',
          targetType: 'user',
          targetId: userId,
          reason: `title=${titleRow.name}`,
        })
        .run();
    });
  }

  revokeTitle(actorId: string, titleId: number, userId: string): void {
    const deleted = this.db.db
      .delete(userTitle)
      .where(and(eq(userTitle.userId, userId), eq(userTitle.titleId, titleId)))
      .run();
    if (deleted.changes === 0) {
      throw new NotFoundException('该用户没有此称号');
    }
    this.log(actorId, 'revoke_title', `user=${userId} title=${titleId}`);
  }

  reviewTitleApplication(actorId: string, id: number, approve: boolean): TitleApplicationSummary {
    const row = this.db.db.select().from(titleApplication).where(eq(titleApplication.id, id)).get();
    if (!row) {
      throw new NotFoundException('称号申请不存在');
    }
    if (row.status !== 'pending') {
      throw new ConflictException('该申请已处理');
    }
    const now = new Date();
    let createdTitle: TitleRow | null = null;
    this.db.db.transaction((tx) => {
      if (approve) {
        const nameTaken = tx
          .select({ id: titleTable.id })
          .from(titleTable)
          .where(eq(titleTable.name, row.proposedName))
          .get();
        if (nameTaken) {
          throw new ConflictException('称号名称已被占用，请驳回后让用户重新申请');
        }
        createdTitle = tx
          .insert(titleTable)
          .values({
            name: row.proposedName,
            kind: 'custom',
            description: row.reason.slice(0, 200),
            color: '#facc15',
            createdBy: actorId,
          })
          .returning()
          .get();
        tx.insert(userTitle)
          .values({ userId: row.userId, titleId: createdTitle.id, grantedBy: actorId })
          .onConflictDoNothing()
          .run();
      }
      tx.update(titleApplication)
        .set({
          status: approve ? 'approved' : 'rejected',
          resultTitleId: createdTitle?.id ?? null,
          reviewedBy: actorId,
          reviewedAt: now,
        })
        .where(eq(titleApplication.id, id))
        .run();
      tx.insert(notification)
        .values({
          userId: row.userId,
          type: 'system',
          actorId,
          message: approve
            ? `你的专属称号「${row.proposedName}」已通过审核`
            : '你的专属称号申请未通过审核',
          link: '/forum/growth',
        })
        .run();
      tx.insert(moderationLog)
        .values({
          actorId,
          action: 'review_title_application',
          targetType: 'title_application',
          targetId: String(id),
          reason: approve ? 'approved' : 'rejected',
        })
        .run();
    });
    const updated = this.db.db
      .select()
      .from(titleApplication)
      .where(eq(titleApplication.id, id))
      .get();
    return this.toApplicationSummary(updated ?? row);
  }

  // ------------------------------------------------------------ admin: banners

  adminBanners(status?: BannerRow['status']): AdminBannerOverview {
    const rows = this.db.db
      .select({ banner: bannerTable, ownerName: userTable.name })
      .from(bannerTable)
      .innerJoin(userTable, eq(bannerTable.userId, userTable.id))
      .where(status === undefined ? undefined : eq(bannerTable.status, status))
      .orderBy(desc(bannerTable.createdAt))
      .limit(100)
      .all();
    return { banners: rows.map((row) => this.toBannerSummary(row.banner, row.ownerName)) };
  }

  reviewBanner(actorId: string, id: number, approve: boolean): BannerSummary {
    const row = this.db.db.select().from(bannerTable).where(eq(bannerTable.id, id)).get();
    if (!row) {
      throw new NotFoundException('Banner 不存在');
    }
    if (row.status !== 'pending') {
      throw new ConflictException('该 Banner 已处理');
    }
    const owner = this.db.db
      .select({ name: userTable.name, points: userProgress.points })
      .from(userTable)
      .leftJoin(userProgress, eq(userProgress.userId, userTable.id))
      .where(eq(userTable.id, row.userId))
      .get();
    const now = new Date();
    const endsAt = new Date(now.getTime() + this.rules().bannerDays * DAY_MS);
    this.db.db.transaction((tx) => {
      tx.update(bannerTable)
        .set({
          status: approve ? 'approved' : 'rejected',
          startsAt: approve ? now : null,
          endsAt: approve ? endsAt : null,
          reviewedBy: actorId,
          reviewedAt: now,
        })
        .where(eq(bannerTable.id, id))
        .run();
      if (!approve) {
        const balance = this.applyPoints(
          tx,
          row.userId,
          row.pointsSpent,
          owner?.points ?? 0,
          'banner_refund',
          { memo: `Banner 未通过审核，退还积分：${row.title}`, refId: String(row.id) },
        );
        tx.update(userProgress)
          .set({ points: balance, updatedAt: now })
          .where(eq(userProgress.userId, row.userId))
          .run();
      }
      tx.insert(notification)
        .values({
          userId: row.userId,
          type: 'system',
          actorId,
          message: approve
            ? `你的 Banner「${row.title}」已通过审核，将在首页展示 ${this.rules().bannerDays} 天`
            : `你的 Banner「${row.title}」未通过审核，积分已退还`,
          link: '/forum/growth',
        })
        .run();
      tx.insert(moderationLog)
        .values({
          actorId,
          action: 'review_banner',
          targetType: 'banner',
          targetId: String(id),
          reason: approve ? 'approved' : 'rejected',
        })
        .run();
    });
    const updated = this.db.db.select().from(bannerTable).where(eq(bannerTable.id, id)).get();
    return this.toBannerSummary(updated ?? row, owner?.name ?? '');
  }

  // ------------------------------------------------------------- admin: points

  adjustPoints(
    actorId: string,
    userId: string,
    amount: number,
    memo?: string,
  ): AdjustPointsResponse {
    if (!Number.isInteger(amount) || amount === 0) {
      throw new BadRequestException('积分调整必须是非零整数');
    }
    if (Math.abs(amount) > 100_000) {
      throw new BadRequestException('单次积分调整不能超过 100000');
    }
    const target = this.db.db
      .select({ id: userTable.id, name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .get();
    if (!target) {
      throw new NotFoundException('用户不存在');
    }
    const row = this.ensure(userId);
    if (row.points + amount < 0) {
      throw new BadRequestException('扣减后积分不能为负数');
    }
    const created = this.db.db.transaction((tx) => {
      const balance = this.applyPoints(tx, userId, amount, row.points, 'admin_adjust', {
        memo: memo ?? '管理员调整',
        refId: actorId,
      });
      tx.update(userProgress)
        .set({ points: balance, updatedAt: new Date() })
        .where(eq(userProgress.userId, userId))
        .run();
      tx.insert(notification)
        .values({
          userId,
          type: 'system',
          actorId,
          message:
            amount > 0
              ? `管理员向你赠送了 ${amount} 积分`
              : `管理员扣除了 ${Math.abs(amount)} 积分`,
          link: '/forum/growth',
        })
        .run();
      tx.insert(moderationLog)
        .values({
          actorId,
          action: 'adjust_points',
          targetType: 'user',
          targetId: userId,
          reason: `${amount > 0 ? '+' : ''}${amount}${memo ? ` ${memo}` : ''}`,
        })
        .run();
      return tx
        .select()
        .from(pointTransaction)
        .where(eq(pointTransaction.userId, userId))
        .orderBy(desc(pointTransaction.id))
        .limit(1)
        .get();
    });
    return {
      userId,
      points: this.ensure(userId).points,
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

  private applyPoints(
    tx: Tx,
    userId: string,
    amount: number,
    currentBalance: number,
    reason: PointTransactionSummary['reason'],
    extra: { memo?: string; refId?: string } = {},
  ): number {
    const balanceAfter = currentBalance + amount;
    if (balanceAfter < 0) {
      throw new BadRequestException('积分不足');
    }
    tx.insert(pointTransaction)
      .values({
        userId,
        amount,
        balanceAfter,
        reason,
        memo: extra.memo ?? null,
        refId: extra.refId ?? null,
      })
      .run();
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

  private toApplicationSummary(
    row: typeof titleApplication.$inferSelect,
    userName = '',
  ): TitleApplicationSummary {
    const user = this.db.db
      .select({ name: userTable.name })
      .from(userTable)
      .where(eq(userTable.id, row.userId))
      .get();
    const resultTitle =
      row.resultTitleId === null
        ? null
        : (this.db.db.select().from(titleTable).where(eq(titleTable.id, row.resultTitleId)).get() ??
          null);
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

  private log(actorId: string, action: 'grant_title' | 'revoke_title', reason: string): void {
    this.db.db
      .insert(moderationLog)
      .values({ actorId, action, targetType: 'title', targetId: '0', reason })
      .run();
  }
}
