import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { TITLE_APPLICATION_STATUSES, TITLE_KINDS } from '@mcserauth/shared';
import { user } from './user.js';

/**
 * Curated titles (`special`: sponsor/partner/friend) and custom titles created
 * from approved level-100 applications.
 */
export const title = sqliteTable('title', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  kind: text('kind', { enum: TITLE_KINDS }).notNull().default('special'),
  description: text('description'),
  color: text('color').notNull().default('#8b5cf6'),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Title assignments; holders display the title instead of a level badge. */
export const userTitle = sqliteTable(
  'user_title',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    titleId: integer('title_id')
      .notNull()
      .references(() => title.id, { onDelete: 'cascade' }),
    grantedBy: text('granted_by').references(() => user.id, { onDelete: 'set null' }),
    grantedAt: integer('granted_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('user_title_user_title_unique').on(t.userId, t.titleId),
    index('user_title_user_idx').on(t.userId),
  ],
);

/** Level-100 exclusive-title applications reviewed by staff. */
export const titleApplication = sqliteTable(
  'title_application',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    proposedName: text('proposed_name').notNull(),
    reason: text('reason').notNull(),
    status: text('status', { enum: TITLE_APPLICATION_STATUSES }).notNull().default('pending'),
    /** Title created when the application is approved. */
    resultTitleId: integer('result_title_id').references(() => title.id, {
      onDelete: 'set null',
    }),
    reviewedBy: text('reviewed_by').references(() => user.id, { onDelete: 'set null' }),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('title_application_status_idx').on(t.status),
    index('title_application_user_idx').on(t.userId),
  ],
);
