import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { REPLY_STATUSES } from '@mcserauth/shared';
import { post } from './post.js';
import { user } from './user.js';

/** Forum reply. `floor` is assigned by the application per post. */
export const reply = sqliteTable(
  'reply',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    postId: integer('post_id')
      .notNull()
      .references(() => post.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    contentMd: text('content_md').notNull(),
    status: text('status', { enum: REPLY_STATUSES }).notNull().default('published'),
    floor: integer('floor').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('reply_post_id_idx').on(t.postId),
    index('reply_post_status_floor_idx').on(t.postId, t.status, t.floor),
    index('reply_author_id_idx').on(t.authorId),
    uniqueIndex('reply_post_floor_unique').on(t.postId, t.floor),
  ],
);
