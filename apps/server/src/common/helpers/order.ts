import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';

/**
 * Sort key that puts NULL values after non-NULL values on every dialect.
 *
 * SQLite and MySQL treat NULL as the smallest value, so `ASC` puts NULLs first
 * and `DESC` puts them last. PostgreSQL treats NULL as the largest value, so
 * `DESC` puts NULLs first. Prefixing an `IS NULL` key makes the order explicit:
 * `false`/`0` sorts before `true`/`1` in all three databases.
 *
 * Use it as the first `orderBy` argument, before the column's real direction:
 *
 * ```ts
 * .orderBy(nullsLast(banner.startsAt), desc(banner.startsAt))
 * ```
 */
export function nullsLast(column: SQLWrapper): SQL {
  return sql`${column} is null`;
}
