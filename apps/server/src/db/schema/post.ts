import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { POST_STATUSES } from '@mcserauth/shared';
import { category } from './category.js';
import { user } from './user.js';

/**
 * Forum post. `reply_count` is deliberately absent (S6: real-time COUNT).
 * S5: deletion is a status value, rows are never removed.
 */
export const post = sqliteTable(
  'post',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    categoryId: integer('category_id')
      .notNull()
      .references(() => category.id, { onDelete: 'restrict' }),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    contentMd: text('content_md').notNull(),
    status: text('status', { enum: POST_STATUSES }).notNull().default('published'),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
    /** Locked posts reject new replies from regular users. */
    locked: integer('locked', { mode: 'boolean' }).notNull().default(false),
    lastActivityAt: integer('last_activity_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('post_category_id_idx').on(t.categoryId),
    index('post_author_id_idx').on(t.authorId),
    index('post_status_idx').on(t.status),
    index('post_status_last_activity_idx').on(t.status, t.lastActivityAt),
    index('post_category_status_activity_idx').on(t.categoryId, t.status, t.lastActivityAt),
    index('post_pinned_idx').on(t.pinned),
    index('post_last_activity_at_idx').on(t.lastActivityAt),
  ],
);
