import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { ADMIN_PERMISSIONS } from '@mcserauth/shared';
import { user } from './user.js';

/**
 * Per-account capability grants delegated by a superadmin.
 *
 * Roles remain the baseline (reviewer → admin → superadmin); this table only
 * adds specific superadmin capabilities to individual staff accounts.
 */
export const userPermission = sqliteTable(
  'user_permission',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    permission: text('permission', { enum: ADMIN_PERMISSIONS }).notNull(),
    grantedBy: text('granted_by').references(() => user.id, { onDelete: 'set null' }),
    grantedAt: integer('granted_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.permission] }),
    index('user_permission_user_idx').on(t.userId),
  ],
);
