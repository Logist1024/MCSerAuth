import { ConflictException, Injectable } from '@nestjs/common';
import { LEVEL_MAX, XP_PER_LEVEL, levelFromXp, type CheckinResponse } from '@mcserauth/shared';
import { eq } from 'drizzle-orm';
import { DbService } from '../../db/db.service.js';
import { dailyCheckin, userProgress } from '../../db/schema/index.js';
import { RulesService } from './rules.service.js';
import { XpService } from './xp.service.js';
import { PointsService } from './points.service.js';
import { dayKey, lockProgressRow, shiftDay } from './growth.util.js';

/** Daily check-in with the streak bonus; points go through the shared ledger. */
@Injectable()
export class CheckinService {
  constructor(
    private readonly db: DbService,
    private readonly rulesService: RulesService,
    private readonly xp: XpService,
    private readonly points: PointsService,
  ) {}

  async checkin(userId: string, now = new Date()): Promise<CheckinResponse> {
    const today = dayKey(now);
    await this.xp.ensure(userId);
    const rules = await this.rulesService.rules();
    // The special-title exemption is stable enough to read before the lock;
    // balance and streak are always derived from the locked row below.
    const levelExempt = await this.xp.hasSpecialTitle(userId);
    const outcome = await this.db.transaction(async (tx) => {
      // The row lock serializes double-clicks: the second request observes
      // lastCheckinOn === today and gets a clean 409 instead of a unique-key 500.
      const row = await lockProgressRow(this.db, tx, userId);
      if (row.lastCheckinOn === today) {
        throw new ConflictException('今天已经签到过了，明天再来');
      }
      const streak = row.lastCheckinOn === shiftDay(today, -1) ? row.checkinStreak + 1 : 1;
      const xpBase =
        rules.checkinBaseXp +
        Math.min(Math.max(0, streak - 1), rules.checkinStreakXpCap) * rules.checkinStreakXp;
      const pointsAwarded =
        rules.checkinBasePoints +
        Math.min(Math.max(0, streak - 1), rules.checkinStreakPointsCap) * rules.checkinStreakPoints;
      const boosted = row.xpBoostUntil !== null && row.xpBoostUntil.getTime() > now.getTime();
      // A special title opts the account out of the level ladder, but the daily
      // check-in and its points still count.
      const xpAwarded = levelExempt
        ? 0
        : Math.floor(xpBase * (boosted ? rules.xpBoostMultiplier : 1));
      await tx
        .insert(dailyCheckin)
        .values({ userId, checkinOn: today, streak, xpAwarded, pointsAwarded });
      await this.points.applyPoints(tx, userId, pointsAwarded, 'checkin', {
        memo: `连续签到 ${streak} 天`,
        refId: today,
      });
      const xp = Math.min(LEVEL_MAX * XP_PER_LEVEL, row.xp + xpAwarded);
      await tx
        .update(userProgress)
        .set({
          xp,
          level: levelFromXp(xp),
          checkinStreak: streak,
          lastCheckinOn: today,
          totalCheckins: row.totalCheckins + 1,
          updatedAt: now,
        })
        .where(eq(userProgress.userId, userId));
      return { xpAwarded, pointsAwarded, streak };
    });
    return {
      progress: await this.xp.summary(userId, now),
      ...outcome,
    };
  }
}
