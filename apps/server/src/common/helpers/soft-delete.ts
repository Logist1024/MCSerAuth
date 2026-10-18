import { isNull, type SQL } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

/**
 * S5 soft-delete filter: rows are not physically removed; a nullable marker
 * (e.g. `token.revoked_at`, `notification.read_at`) carries the state.
 *
 * Usage: `where(activeRows(token.revokedAt))`.
 */
export function activeRows(softDeleteColumn: AnySQLiteColumn): SQL {
  return isNull(softDeleteColumn);
}
