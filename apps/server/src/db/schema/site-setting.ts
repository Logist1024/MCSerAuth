import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './user.js';

/**
 * Key-value site configuration.
 *
 * Display values (site name, footer, banner) are public; mail credentials are
 * only readable through the root console and secrets are stored encrypted.
 */
export const siteSetting = sqliteTable('site_setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
});
