import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { MODERATION_ACTIONS } from '@mcserauth/shared';
import { user } from './user.js';

/** Append-only moderation audit trail. */
export const moderationLog = sqliteTable('moderation_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
  action: text('action', { enum: MODERATION_ACTIONS }).notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  reason: text('reason'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});
