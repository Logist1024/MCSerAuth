import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { POINT_REASONS } from '@mcserauth/shared';
import { user } from './user.js';

/**
 * Accumulated growth state per account.
 *
 * `xp`/`level` are denormalised so leaderboards can sort without recomputing;
 * the shared level curve remains the single source of truth.
 */
export const userProgress = sqliteTable(
  'user_progress',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    xp: integer('xp').notNull().default(0),
    level: integer('level').notNull().default(1),
    points: integer('points').notNull().default(0),
    checkinStreak: integer('checkin_streak').notNull().default(0),
    /** Local calendar day (YYYY-MM-DD) of the last successful check-in. */
    lastCheckinOn: text('last_checkin_on'),
    totalCheckins: integer('total_checkins').notNull().default(0),
    xpBoostUntil: integer('xp_boost_until', { mode: 'timestamp' }),
    capeUnlockedAt: integer('cape_unlocked_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('user_progress_xp_idx').on(t.xp), index('user_progress_points_idx').on(t.points)],
);

/** Daily check-in ledger; one row per account per calendar day. */
export const dailyCheckin = sqliteTable(
  'daily_checkin',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    checkinOn: text('checkin_on').notNull(),
    streak: integer('streak').notNull().default(1),
    xpAwarded: integer('xp_awarded').notNull().default(0),
    pointsAwarded: integer('points_awarded').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('daily_checkin_user_day_unique').on(t.userId, t.checkinOn),
    index('daily_checkin_day_idx').on(t.checkinOn),
  ],
);

/** Append-only points ledger; `balance_after` allows audit without replay. */
export const pointTransaction = sqliteTable(
  'point_transaction',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    reason: text('reason', { enum: POINT_REASONS }).notNull(),
    memo: text('memo'),
    refId: text('ref_id'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('point_transaction_user_idx').on(t.userId),
    index('point_transaction_created_idx').on(t.createdAt),
  ],
);
