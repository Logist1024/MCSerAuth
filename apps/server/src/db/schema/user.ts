import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { USER_ROLES } from '@mcserauth/shared';

/**
 * Website account (`user`).
 *
 * This table is owned by MCSerAuth (it carries the business columns), while
 * better-auth writes its identity fields. Columns required by better-auth's
 * core user model are therefore present as well:
 *  - `name`         required display name (signup form)
 *  - `avatarUrl`    mapped to better-auth's `image`
 *  - `updatedAt`    maintained by better-auth
 *
 * `avatarUrl` uses a camelCase Drizzle property so better-auth's field mapping
 * (`user.fields.image = "avatarUrl"`) can address it while the DB column keeps
 * the snake_case name from the schema appendix.
 */
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  /** S3: role enum, deliberately no RBAC tables. */
  role: text('role', { enum: USER_ROLES }).notNull().default('user'),
  /** Forum ban flag; game ban lives on `player.banned`. */
  banned: integer('banned', { mode: 'boolean' }).notNull().default(false),
  signature: text('signature'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});
