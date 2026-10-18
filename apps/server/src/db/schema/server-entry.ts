import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Server allow-list: only registered game servers may call `hasJoined`.
 * `secret` stores a hash, never plaintext.
 */
export const serverEntry = sqliteTable('server_entry', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  serverId: text('server_id').notNull().unique(),
  name: text('name').notNull(),
  secret: text('secret').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});
