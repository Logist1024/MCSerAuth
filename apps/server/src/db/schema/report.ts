import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { REPORT_STATUSES, REPORT_TARGET_TYPES } from '@mcserauth/shared';
import { user } from './user.js';

/**
 * Content/user report. `target_id` is TEXT because targets are polymorphic
 * (user ids are UUID strings, post/reply ids are integers).
 */
export const report = sqliteTable(
  'report',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    targetType: text('target_type', { enum: REPORT_TARGET_TYPES }).notNull(),
    targetId: text('target_id').notNull(),
    reporterId: text('reporter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    status: text('status', { enum: REPORT_STATUSES }).notNull().default('pending'),
    handledBy: text('handled_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('report_status_idx').on(t.status)],
);
