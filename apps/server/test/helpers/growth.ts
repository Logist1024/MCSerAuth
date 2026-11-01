import type { DbService } from '../../src/db/db.service.js';
import { BannersService } from '../../src/modules/growth/banners.service.js';
import { CheckinService } from '../../src/modules/growth/checkin.service.js';
import { LeaderboardService } from '../../src/modules/growth/leaderboard.service.js';
import { PointsService } from '../../src/modules/growth/points.service.js';
import { ProgressService } from '../../src/modules/growth/progress.service.js';
import { RulesService } from '../../src/modules/growth/rules.service.js';
import { ShopService } from '../../src/modules/growth/shop.service.js';
import { TitlesService } from '../../src/modules/growth/titles.service.js';
import { XpService } from '../../src/modules/growth/xp.service.js';

/**
 * Wires the growth sub-services the same way Nest does, so unit tests keep
 * exercising the public ProgressService facade after the F7 split.
 */
export function createProgressService(db: DbService): ProgressService {
  const rules = new RulesService(db);
  const xp = new XpService(db, rules);
  const points = new PointsService(db, rules, xp);
  const titles = new TitlesService(db, rules, xp);
  const checkin = new CheckinService(db, rules, xp, points);
  const shop = new ShopService(db, rules, xp, points);
  const banners = new BannersService(db, rules, points);
  const leaderboard = new LeaderboardService(db);
  return new ProgressService(rules, xp, points, titles, checkin, shop, banners, leaderboard);
}
