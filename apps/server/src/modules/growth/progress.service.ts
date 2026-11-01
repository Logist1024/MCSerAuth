import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type {
  AdjustPointsResponse,
  AdminBannerOverview,
  AdminTitleOverview,
  BannerSummary,
  CheckinResponse,
  CreateTitleRequest,
  GrowthOverviewResponse,
  GrowthRules,
  GrowthRulesPatch,
  GrowthRulesResponse,
  LeaderboardEntry,
  PointTransactionPage,
  PurchaseRequest,
  PurchaseResponse,
  ShopItem,
  SubmitTitleApplicationRequest,
  TipRequest,
  TipResponse,
  TitleApplicationSummary,
  UserProgressSummary,
  UserTitleSummary,
} from '@mcserauth/shared';
import { BannersService } from './banners.service.js';
import { CheckinService } from './checkin.service.js';
import { LeaderboardService } from './leaderboard.service.js';
import { PointsService } from './points.service.js';
import { RulesService } from './rules.service.js';
import { ShopService } from './shop.service.js';
import { TitlesService } from './titles.service.js';
import { XpService } from './xp.service.js';
import type { BannerRow, ProgressRow } from './growth.util.js';

/**
 * Stable facade over the growth sub-services.
 *
 * The domain used to be one 1250-line class; F7 split the implementation by
 * data ownership while keeping this class as the single injection point so
 * forum, admin, profile and site callers (and the HTTP API) stay unchanged.
 */
@Injectable()
export class ProgressService implements OnModuleInit {
  private readonly logger = new Logger(ProgressService.name);
  constructor(
    private readonly rulesService: RulesService,
    private readonly xp: XpService,
    private readonly points: PointsService,
    private readonly titles: TitlesService,
    private readonly checkinService: CheckinService,
    private readonly shop: ShopService,
    private readonly banners: BannersService,
    private readonly leaderboardService: LeaderboardService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Seeding must not crash the boot when the database is briefly unavailable:
    // /health/ready reports the outage and the next successful boot seeds.
    try {
      await this.titles.seedSpecialTitles();
    } catch (error: unknown) {
      this.logger.warn(`Special title seeding skipped; will retry on next boot: ${String(error)}`);
    }
  }

  // -------------------------------------------------------------------- rules
  async rules(): Promise<GrowthRules> {
    return await this.rulesService.rules();
  }

  async shopItems(): Promise<ShopItem[]> {
    return await this.rulesService.shopItems();
  }

  async rulesView(): Promise<GrowthRulesResponse> {
    return await this.rulesService.rulesView();
  }

  async updateRules(actorId: string, patch: GrowthRulesPatch): Promise<GrowthRulesResponse> {
    return await this.rulesService.updateRules(actorId, patch);
  }

  async resetRules(actorId: string): Promise<GrowthRulesResponse> {
    return await this.rulesService.resetRules(actorId);
  }

  // ------------------------------------------------------------------ progress
  async ensure(userId: string): Promise<ProgressRow> {
    return await this.xp.ensure(userId);
  }

  async summary(userId: string, now = new Date()): Promise<UserProgressSummary> {
    return await this.xp.summary(userId, now);
  }

  async hasSpecialTitle(userId: string): Promise<boolean> {
    return await this.xp.hasSpecialTitle(userId);
  }

  async activeTitle(userId: string): Promise<UserTitleSummary | null> {
    return await this.xp.activeTitle(userId);
  }

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
    return await this.xp.badgesFor(userIds);
  }

  async awardXp(
    userId: string,
    baseXp: number,
    memo: string | null = null,
    now = new Date(),
  ): Promise<number> {
    return await this.xp.awardXp(userId, baseXp, memo, now);
  }

  async awardPostXp(userId: string, now = new Date()): Promise<number> {
    return await this.xp.awardPostXp(userId, now);
  }

  async awardReplyXp(userId: string, now = new Date()): Promise<number> {
    return await this.xp.awardReplyXp(userId, now);
  }

  async capeUnlocked(userId: string): Promise<boolean> {
    return await this.xp.capeUnlocked(userId);
  }

  async assertCapeUnlocked(userId: string): Promise<void> {
    await this.xp.assertCapeUnlocked(userId);
  }

  // ------------------------------------------------------------------ check-in
  async checkin(userId: string, now = new Date()): Promise<CheckinResponse> {
    return await this.checkinService.checkin(userId, now);
  }

  // ---------------------------------------------------------------------- shop
  async purchase(
    userId: string,
    input: PurchaseRequest,
    now = new Date(),
  ): Promise<PurchaseResponse> {
    return await this.shop.purchase(userId, input, now);
  }

  // -------------------------------------------------------------------- points
  async tip(fromUserId: string, input: TipRequest): Promise<TipResponse> {
    return await this.points.tip(fromUserId, input);
  }

  async listTransactions(userId: string, page = 1, pageSize = 20): Promise<PointTransactionPage> {
    return await this.points.listTransactions(userId, page, pageSize);
  }

  async adjustPoints(
    actorId: string,
    userId: string,
    amount: number,
    memo?: string,
  ): Promise<AdjustPointsResponse> {
    return await this.points.adjustPoints(actorId, userId, amount, memo);
  }

  async walletsFor(userIds: string[]): Promise<Map<string, number>> {
    return await this.points.walletsFor(userIds);
  }

  // -------------------------------------------------------------------- titles
  async listTitles(): Promise<UserTitleSummary[]> {
    return await this.titles.listTitles();
  }

  async submitTitleApplication(
    userId: string,
    input: SubmitTitleApplicationRequest,
  ): Promise<TitleApplicationSummary> {
    return await this.titles.submitTitleApplication(userId, input);
  }

  async pendingApplication(userId: string): Promise<TitleApplicationSummary | null> {
    return await this.titles.pendingApplication(userId);
  }

  async adminTitleOverview(): Promise<AdminTitleOverview> {
    return await this.titles.adminTitleOverview();
  }

  async createSpecialTitle(actorId: string, input: CreateTitleRequest): Promise<UserTitleSummary> {
    return await this.titles.createSpecialTitle(actorId, input);
  }

  async grantTitle(actorId: string, titleId: number, userId: string): Promise<void> {
    await this.titles.grantTitle(actorId, titleId, userId);
  }

  async revokeTitle(actorId: string, titleId: number, userId: string): Promise<void> {
    await this.titles.revokeTitle(actorId, titleId, userId);
  }

  async reviewTitleApplication(
    actorId: string,
    id: number,
    approve: boolean,
  ): Promise<TitleApplicationSummary> {
    return await this.titles.reviewTitleApplication(actorId, id, approve);
  }

  // ------------------------------------------------------------------- banners
  async listActiveBanners(limit = 6, now = new Date()): Promise<BannerSummary[]> {
    return await this.banners.listActiveBanners(limit, now);
  }

  async listOwnBanners(userId: string): Promise<BannerSummary[]> {
    return await this.banners.listOwnBanners(userId);
  }

  async adminBanners(status?: BannerRow['status']): Promise<AdminBannerOverview> {
    return await this.banners.adminBanners(status);
  }

  async reviewBanner(actorId: string, id: number, approve: boolean): Promise<BannerSummary> {
    return await this.banners.reviewBanner(actorId, id, approve);
  }

  // --------------------------------------------------------------- leaderboard
  async leaderboard(limit = 10): Promise<LeaderboardEntry[]> {
    return await this.leaderboardService.leaderboard(limit);
  }

  // ------------------------------------------------------------------- overview
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
}
