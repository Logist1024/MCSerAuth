import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';

/**
 * Case-insensitive substring match that behaves the same on SQLite, MySQL and
 * PostgreSQL.
 *
 * PostgreSQL's `LIKE` is case-sensitive while SQLite and MySQL default
 * collations are case-insensitive. Lowercasing both sides keeps search results
 * identical across dialects (at the cost of not using a plain index, which a
 * leading-wildcard search could not use anyway).
 */
export function containsIgnoreCase(column: SQLWrapper, term: string): SQL {
  return sql`lower(${column}) like ${`%${term.toLowerCase()}%`}`;
}
