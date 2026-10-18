import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { VOTE_TARGET_TYPES } from '@mcserauth/shared';
import { user } from './user.js';

/**
 * Up-vote / like. The composite UNIQUE index prevents duplicate votes on the
 * same target by the same user.
 */
export const vote = sqliteTable(
  'vote',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    targetType: text('target_type', { enum: VOTE_TARGET_TYPES }).notNull(),
    targetId: integer('target_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex('vote_user_target_unique_idx').on(t.userId, t.targetType, t.targetId)],
);
