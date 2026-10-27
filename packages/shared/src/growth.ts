import { z } from 'zod';
import type { BannerStatus, PointReason, TitleApplicationStatus, TitleKind } from './enums.js';

/**
 * Growth economy contracts: levels, daily check-in, points, titles and banners.
 *
 * The level curve is deliberately linear and shared by server and web so the
 * progress bar can be rendered without another round-trip:
 * every level costs 100 XP, level 100 is reached at 10 000 XP.
 */

export const LEVEL_MAX = 100;
export const XP_PER_LEVEL = 100;
export const MAX_XP = LEVEL_MAX * XP_PER_LEVEL;

export interface LevelTier {
  minLevel: number;
  maxLevel: number;
  name: string;
  color: string;
}

export const LEVEL_TIERS: readonly LevelTier[] = [
  { minLevel: 1, maxLevel: 10, name: '初来乍到', color: '#64748b' },
  { minLevel: 11, maxLevel: 20, name: '崭露头角', color: '#0ea5e9' },
  { minLevel: 21, maxLevel: 30, name: '渐入佳境', color: '#14b8a6' },
  { minLevel: 31, maxLevel: 40, name: '小有名气', color: '#22c55e' },
  { minLevel: 41, maxLevel: 50, name: '社区中坚', color: '#84cc16' },
  { minLevel: 51, maxLevel: 60, name: '资深玩家', color: '#eab308' },
  { minLevel: 61, maxLevel: 70, name: '风云人物', color: '#f59e0b' },
  { minLevel: 71, maxLevel: 80, name: '传奇旅人', color: '#f97316' },
  { minLevel: 81, maxLevel: 90, name: '殿堂成员', color: '#ec4899' },
  { minLevel: 91, maxLevel: 99, name: '大佬', color: '#a855f7' },
  { minLevel: 100, maxLevel: 100, name: '传说', color: '#facc15' },
];

export function levelFromXp(xp: number): number {
  const normalized = Math.max(0, Math.floor(xp));
  return Math.min(LEVEL_MAX, Math.floor(normalized / XP_PER_LEVEL) + 1);
}

export function xpForLevel(level: number): number {
  return Math.min(MAX_XP, Math.max(0, (level - 1) * XP_PER_LEVEL));
}

export function tierForLevel(level: number): LevelTier {
  const normalized = Math.min(LEVEL_MAX, Math.max(1, Math.floor(level)));
  return LEVEL_TIERS.find((tier) => normalized >= tier.minLevel && normalized <= tier.maxLevel)!;
}

/** Every tunable knob of the growth economy; superadmins can override these. */
export interface GrowthRules {
  checkinBaseXp: number;
  checkinStreakXp: number;
  checkinStreakXpCap: number;
  checkinBasePoints: number;
  checkinStreakPoints: number;
  checkinStreakPointsCap: number;
  postXp: number;
  postDailyXpLimit: number;
  replyXp: number;
  replyDailyXpLimit: number;
  xpBoostMultiplier: number;
  xpBoostHours: number;
  xpBoostPrice: number;
  capeUnlockPrice: number;
  bannerPrice: number;
  bannerDays: number;
  bannerMaxActive: number;
  tipMin: number;
  tipMax: number;
  titleApplicationLevel: number;
}

/** Shipped defaults, used as the base for the per-site override merge. */
export const GROWTH_RULES: GrowthRules = {
  checkinBaseXp: 10,
  checkinStreakXp: 2,
  checkinStreakXpCap: 7,
  checkinBasePoints: 10,
  checkinStreakPoints: 2,
  checkinStreakPointsCap: 7,
  postXp: 20,
  postDailyXpLimit: 5,
  replyXp: 5,
  replyDailyXpLimit: 10,
  xpBoostMultiplier: 2,
  xpBoostHours: 24,
  xpBoostPrice: 120,
  capeUnlockPrice: 300,
  bannerPrice: 500,
  bannerDays: 7,
  bannerMaxActive: 6,
  tipMin: 1,
  tipMax: 10_000,
  titleApplicationLevel: 100,
};

export const growthRulesSchema = z.object({
  checkinBaseXp: z.number().int().min(0).max(1000),
  checkinStreakXp: z.number().int().min(0).max(1000),
  checkinStreakXpCap: z.number().int().min(0).max(60),
  checkinBasePoints: z.number().int().min(0).max(1000),
  checkinStreakPoints: z.number().int().min(0).max(1000),
  checkinStreakPointsCap: z.number().int().min(0).max(60),
  postXp: z.number().int().min(0).max(1000),
  postDailyXpLimit: z.number().int().min(0).max(100),
  replyXp: z.number().int().min(0).max(1000),
  replyDailyXpLimit: z.number().int().min(0).max(200),
  xpBoostMultiplier: z.number().int().min(1).max(10),
  xpBoostHours: z.number().int().min(1).max(720),
  xpBoostPrice: z.number().int().min(0).max(1_000_000),
  capeUnlockPrice: z.number().int().min(0).max(1_000_000),
  bannerPrice: z.number().int().min(0).max(1_000_000),
  bannerDays: z.number().int().min(1).max(365),
  bannerMaxActive: z.number().int().min(1).max(20),
  tipMin: z.number().int().min(1).max(1_000_000),
  tipMax: z.number().int().min(1).max(10_000_000),
  titleApplicationLevel: z.number().int().min(1).max(LEVEL_MAX),
});

export type GrowthRulesInput = z.input<typeof growthRulesSchema>;

/**
 * Partial overrides only: keys left out keep the shipped default, which is what
 * makes the stored `site_setting` value safe against future key additions.
 */
export const growthRulesPatchSchema = growthRulesSchema.partial();

export type GrowthRulesPatch = z.input<typeof growthRulesPatchSchema>;

export function mergeGrowthRules(patch: GrowthRulesPatch | null): GrowthRules {
  if (patch === null) {
    return { ...GROWTH_RULES };
  }
  return { ...GROWTH_RULES, ...growthRulesPatchSchema.parse(patch) };
}

export type ShopItemKey = 'xp_boost' | 'cape_unlock' | 'banner';

export const SHOP_ITEM_KEYS: readonly ShopItemKey[] = ['xp_boost', 'cape_unlock', 'banner'];

export interface ShopItem {
  key: ShopItemKey;
  name: string;
  description: string;
  price: number;
  /** One-time purchase (cape) versus repeatable (boost, banner). */
  oneTime: boolean;
}

/** Shop catalogue built from the site's effective rules. */
export function buildShopItems(rules: GrowthRules): ShopItem[] {
  return [
    {
      key: 'xp_boost',
      name: '经验翻倍卡',
      description: `${rules.xpBoostHours} 小时内发帖、回帖与签到经验 ×${rules.xpBoostMultiplier}，重复购买顺延时长。`,
      price: rules.xpBoostPrice,
      oneTime: false,
    },
    {
      key: 'cape_unlock',
      name: '披风功能解锁',
      description: '解锁披风上传与切换能力（永久有效）。',
      price: rules.capeUnlockPrice,
      oneTime: true,
    },
    {
      key: 'banner',
      name: '首页 Banner 位',
      description: `提交一条首页 Banner（${rules.bannerDays} 天展示），经由管理员审核后上线。`,
      price: rules.bannerPrice,
      oneTime: false,
    },
  ];
}

export interface UserTitleSummary {
  id: number;
  name: string;
  kind: TitleKind;
  description: string | null;
  color: string;
}

export interface UserProgressSummary {
  userId: string;
  xp: number;
  level: number;
  levelTier: LevelTier;
  xpIntoLevel: number;
  xpForNextLevel: number | null;
  progressPercent: number;
  isMaxLevel: boolean;
  points: number;
  checkinStreak: number;
  lastCheckinOn: string | null;
  checkedInToday: boolean;
  totalCheckins: number;
  xpBoostUntil: string | null;
  xpBoostActive: boolean;
  capeUnlocked: boolean;
  /** Active special/custom title; when present the level is not displayed. */
  title: UserTitleSummary | null;
  /**
   * True when a `special` title exempts the account from the level system:
   * no XP accrual and no leaderboard placement.
   */
  levelExempt: boolean;
}

export interface CheckinResponse {
  progress: UserProgressSummary;
  xpAwarded: number;
  pointsAwarded: number;
  streak: number;
}

export interface LeaderboardEntry {
  userId: string;
  name: string;
  avatarUrl: string | null;
  level: number;
  xp: number;
  tierName: string;
  title: UserTitleSummary | null;
}

export interface PointTransactionSummary {
  id: number;
  amount: number;
  balanceAfter: number;
  reason: PointReason;
  memo: string | null;
  createdAt: string;
}

export interface PointTransactionPage {
  items: PointTransactionSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PurchaseRequest {
  item: ShopItemKey;
  bannerTitle?: string;
  bannerDescription?: string;
  bannerHref?: string;
}

export interface PurchaseResponse {
  progress: UserProgressSummary;
  message: string;
  banner: BannerSummary | null;
}

export interface TipRequest {
  userId: string;
  amount: number;
  memo?: string;
}

export interface TipResponse {
  progress: UserProgressSummary;
  recipient: { userId: string; name: string; points: number };
}

export interface BannerSummary {
  id: number;
  userId: string;
  ownerName: string;
  title: string;
  description: string | null;
  href: string | null;
  status: BannerStatus;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

export interface TitleApplicationSummary {
  id: number;
  userId: string;
  userName: string;
  proposedName: string;
  reason: string;
  status: TitleApplicationStatus;
  resultTitle: UserTitleSummary | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface GrowthOverviewResponse {
  progress: UserProgressSummary;
  shop: ShopItem[];
  /** Effective rules after merging the site override with the shipped defaults. */
  rules: GrowthRules;
  titles: UserTitleSummary[];
  leaderboard: LeaderboardEntry[];
  banners: BannerSummary[];
  latestTransactions: PointTransactionSummary[];
  pendingTitleApplication: TitleApplicationSummary | null;
}

export interface GrowthRulesResponse {
  rules: GrowthRules;
  defaults: GrowthRules;
  /** True when the site stores an override row for any rule key. */
  customized: boolean;
}

export interface CreateTitleRequest {
  name: string;
  description?: string | null;
  color?: string;
}

export interface GrantTitleRequest {
  userId: string;
}

export interface SubmitTitleApplicationRequest {
  proposedName: string;
  reason: string;
}

export interface AdminTitleOverview {
  titles: Array<UserTitleSummary & { holders: Array<{ userId: string; name: string }> }>;
  applications: TitleApplicationSummary[];
}

export interface AdminBannerOverview {
  banners: BannerSummary[];
}

export interface AdjustPointsRequest {
  amount: number;
  memo?: string;
}

export interface AdjustPointsResponse {
  userId: string;
  points: number;
  transaction: PointTransactionSummary;
}
