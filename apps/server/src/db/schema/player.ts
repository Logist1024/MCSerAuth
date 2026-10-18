import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './user.js';

/**
 * Game identity (`player`): one per website account, UUID is immutable.
 * S1: `user_id` is UNIQUE (strict 1:1).
 * S4: nickname history is stored as JSON, no separate table.
 */
export const player = sqliteTable('player', {
  uuid: text('uuid').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  nickname: text('nickname').notNull().unique(),
  nicknameHistory: text('nickname_history', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .$defaultFn(() => []),
  previousNickname: text('previous_nickname'),
  nameCooldownAt: integer('name_cooldown_at', { mode: 'timestamp' }),
  /** hasJoined checks this flag (A5: enforced from the next login). */
  banned: integer('banned', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});
