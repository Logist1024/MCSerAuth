import { Injectable, Logger } from '@nestjs/common';
import {
  GROWTH_RULES,
  buildShopItems,
  mergeGrowthRules,
  type GrowthRules,
  type GrowthRulesPatch,
  type GrowthRulesResponse,
  type ShopItem,
} from '@mcserauth/shared';
import { eq } from 'drizzle-orm';
import { DbService } from '../../db/db.service.js';
import { moderationLog, siteSetting } from '../../db/schema/index.js';
import { GROWTH_RULES_KEY } from './growth.util.js';

/**
 * Effective economy values: shipped defaults merged with the single stored
 * override row. Cached because the only writer is this service.
 */
@Injectable()
export class RulesService {
  private readonly logger = new Logger(RulesService.name);
  private rulesCache: GrowthRules | null = null;
  constructor(private readonly db: DbService) {}

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
}
