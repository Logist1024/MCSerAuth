import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { BANNER_STATUSES } from '@mcserauth/shared';
import { user } from './user.js';

/** Homepage banner slots bought with points and approved by staff. */
export const banner = sqliteTable(
  'banner',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    href: text('href'),
    status: text('status', { enum: BANNER_STATUSES }).notNull().default('pending'),
    pointsSpent: integer('points_spent').notNull().default(0),
    startsAt: integer('starts_at', { mode: 'timestamp' }),
    endsAt: integer('ends_at', { mode: 'timestamp' }),
    reviewedBy: text('reviewed_by').references(() => user.id, { onDelete: 'set null' }),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('banner_status_idx').on(t.status),
    index('banner_user_idx').on(t.userId),
    index('banner_window_idx').on(t.startsAt, t.endsAt),
  ],
);
