import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { NOTIFICATION_TYPES } from '@mcserauth/shared';
import { user } from './user.js';

/** In-site notification. `read_at = NULL` means unread. */
export const notification = sqliteTable(
  'notification',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type', { enum: NOTIFICATION_TYPES }).notNull(),
    actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
    /** Free-form text for system/moderation notices; replies/mentions link instead. */
    message: text('message'),
    link: text('link'),
    readAt: integer('read_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('notification_user_id_idx').on(t.userId),
    index('notification_read_at_idx').on(t.readAt),
    index('notification_user_read_idx').on(t.userId, t.readAt),
    index('notification_user_read_created_idx').on(t.userId, t.readAt, t.createdAt),
  ],
);
