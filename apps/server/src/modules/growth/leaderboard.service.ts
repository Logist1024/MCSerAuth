import { Injectable } from '@nestjs/common';
import { levelFromXp, tierForLevel, type LeaderboardEntry } from '@mcserauth/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DbService } from '../../db/db.service.js';
import {
  title as titleTable,
  user as userTable,
  userProgress,
  userTitle,
} from '../../db/schema/index.js';

/** XP leaderboard; special-title holders are excluded from the ladder. */
@Injectable()
export class LeaderboardService {
  constructor(private readonly db: DbService) {}

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
}
