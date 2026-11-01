import { ConflictException, Injectable } from '@nestjs/common';
import { LEVEL_MAX, XP_PER_LEVEL, levelFromXp, type CheckinResponse } from '@mcserauth/shared';
import { eq } from 'drizzle-orm';
import { DbService } from '../../db/db.service.js';
import { dailyCheckin, userProgress } from '../../db/schema/index.js';
import { RulesService } from './rules.service.js';
import { XpService } from './xp.service.js';
import { PointsService } from './points.service.js';
import { dayKey, shiftDay } from './growth.util.js';

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
    const row = await this.xp.ensure(userId);
    if (row.lastCheckinOn === today) {
      throw new ConflictException('今天已经签到过了，明天再来');
    }
    const rules = await this.rulesService.rules();
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
    const xpAwarded = (await this.xp.hasSpecialTitle(userId))
      ? 0
      : Math.floor(xpBase * (boosted ? rules.xpBoostMultiplier : 1));
    await this.db.transaction(async (tx) => {
      await tx
        .insert(dailyCheckin)
        .values({ userId, checkinOn: today, streak, xpAwarded, pointsAwarded });
      const xp = Math.min(LEVEL_MAX * XP_PER_LEVEL, row.xp + xpAwarded);
      const balanceAfter = await this.points.applyPoints(
        tx,
        userId,
        pointsAwarded,
        row.points,
        'checkin',
        {
          memo: `连续签到 ${streak} 天`,
          refId: today,
        },
      );
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
    });
    return {
      progress: await this.xp.summary(userId, now),
      xpAwarded,
      pointsAwarded,
      streak,
    };
  }
}
