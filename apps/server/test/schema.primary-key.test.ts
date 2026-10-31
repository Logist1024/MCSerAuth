import { isTable } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { primaryKeyOf } from '../src/db/db.service.js';
import * as mysqlSchema from '../src/db/schema/generated/mysql.js';
import * as pgSchema from '../src/db/schema/generated/postgres.js';
import * as sqliteSchema from '../src/db/schema/generated/sqlite.js';

/**
 * Drizzle flags only inline `.primaryKey()` columns with `column.primary`.
 * `primaryKeyOf()` must additionally resolve composite keys declared as
 * table-level extras, otherwise the MySQL upsert helpers cannot build their
 * no-op self-assignment (CI regression 2026-10: "The table must have a
 * primary key." for `upload_usage`).
 */
describe('primaryKeyOf schema introspection', () => {
  const schemas: Record<string, typeof pgSchema> = {
    mysql: mysqlSchema as unknown as typeof pgSchema,
    postgres: pgSchema,
    sqlite: sqliteSchema as unknown as typeof pgSchema,
  };

  for (const [dialect, schema] of Object.entries(schemas)) {
    it(`${dialect}: resolves the composite primary key of upload_usage`, () => {
      // The test enforces the column *order* contract too: the first column is
      // the one used by the MySQL insertIgnore self-assignment.
      expect(primaryKeyOf(schema.uploadUsage)).toMatchObject({
        primaryCount: 3,
        primaryProp: 'userId',
      });
    });

    it(`${dialect}: resolves the composite primary key of user_permission`, () => {
      expect(primaryKeyOf(schema.userPermission)).toMatchObject({
        primaryCount: 2,
        primaryProp: 'userId',
      });
    });

    it(`${dialect}: keeps the inline fast path for single-column keys`, () => {
      expect(primaryKeyOf(schema.token)).toEqual({
        primaryCount: 1,
        primaryProp: 'id',
        primaryColumn: schema.token.id,
      });
    });

    it(`${dialect}: every declared table yields a primary key`, () => {
      for (const [name, table] of Object.entries(schema)) {
        if (!isTable(table)) {
          continue;
        }
        expect(() => primaryKeyOf(table), `${name} must resolve a primary key`).not.toThrow();
      }
    });
  }
});
