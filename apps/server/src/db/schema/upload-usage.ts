import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { UPLOAD_KINDS } from '@mcserauth/shared';
import { user } from './user.js';

/**
 * Per-user daily upload counters (single-host quota enforcement).
 *
 * `day` is the UTC calendar date (`YYYY-MM-DD`); rows are tiny and pruned by
 * the maintenance job after 90 days.
 */
export const uploadUsage = sqliteTable(
  'upload_usage',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: UPLOAD_KINDS }).notNull(),
    day: text('day').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.day] })],
);
