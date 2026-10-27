import { describe, expect, it } from 'vitest';
import { tables, tableOrder, type TableModel } from '../src/db/schema/model.js';

/** The generator accepts either the property name or the database column name. */
function hasColumn(table: TableModel, name: string): boolean {
  return table.columns.some((column) => column.prop === name || column.column === name);
}

describe('schema model invariants', () => {
  it('has unique table names', () => {
    const names = tables.map((table) => table.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('lists every table exactly once in tableOrder', () => {
    expect([...tableOrder].sort()).toEqual(tables.map((table) => table.name).sort());
    expect(new Set(tableOrder).size).toBe(tableOrder.length);
  });

  it('gives every table exactly one primary key definition', () => {
    for (const table of tables) {
      const columnPrimaryKeys = table.columns.filter((column) => column.primaryKey === true);
      const compositePrimaryKey = table.primaryKey ?? [];
      const definitions =
        (columnPrimaryKeys.length > 0 ? 1 : 0) + (compositePrimaryKey.length > 0 ? 1 : 0);
      expect(definitions, `${table.name} must define one primary key`).toBe(1);

      if (compositePrimaryKey.length > 0) {
        for (const column of compositePrimaryKey) {
          expect(hasColumn(table, column), `${table.name}.${column} must exist`).toBe(true);
        }
      }
    }
  });

  it('keeps property and column names unique inside a table', () => {
    for (const table of tables) {
      const props = table.columns.map((column) => column.prop);
      const columns = table.columns.map((column) => column.column);
      expect(new Set(props).size, `${table.name} has duplicate property names`).toBe(props.length);
      expect(new Set(columns).size, `${table.name} has duplicate column names`).toBe(
        columns.length,
      );
    }
  });

  it('uses globally unique index names', () => {
    const names = tables.flatMap((table) => (table.indexes ?? []).map((index) => index.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it('only indexes columns that exist', () => {
    for (const table of tables) {
      for (const index of table.indexes ?? []) {
        for (const column of index.columns) {
          expect(
            hasColumn(table, column),
            `${table.name}.${index.name} references missing column ${column}`,
          ).toBe(true);
        }
      }
    }
  });

  it('points every foreign key at an existing table and column', () => {
    for (const table of tables) {
      for (const column of table.columns) {
        if (column.references === undefined) continue;
        const target = tables.find((candidate) => candidate.name === column.references?.table);
        expect(target, `${table.name}.${column.column} references missing table`).toBeDefined();
        expect(
          target !== undefined && hasColumn(target, column.references?.column ?? ''),
          `${table.name}.${column.column} references missing column`,
        ).toBe(true);
      }
    }
  });

  it('uses the same type and length on both sides of every foreign key', () => {
    for (const table of tables) {
      for (const column of table.columns) {
        if (column.references === undefined) continue;
        const target = tables.find((candidate) => candidate.name === column.references?.table);
        const targetColumn = target?.columns.find(
          (candidate) =>
            candidate.prop === column.references?.column ||
            candidate.column === column.references?.column,
        );
        expect(targetColumn, `${table.name}.${column.column} has no target column`).toBeDefined();
        expect(
          { type: column.type, length: column.length ?? null },
          `${table.name}.${column.column} does not match ${target?.name}.${targetColumn?.column}`,
        ).toEqual({ type: targetColumn?.type, length: targetColumn?.length ?? null });
      }
    }
  });

  it('only auto-increments integer primary keys', () => {
    for (const table of tables) {
      for (const column of table.columns) {
        if (column.autoIncrement !== true) continue;
        expect(column.type, `${table.name}.${column.column} must be an integer`).toBe('integer');
        expect(column.primaryKey, `${table.name}.${column.column} must be a primary key`).toBe(
          true,
        );
      }
    }
  });

  it('declares at least one column per table', () => {
    for (const table of tables) {
      expect(table.columns.length, `${table.name} is empty`).toBeGreaterThan(0);
    }
  });

  it('gives every indexed or referenced text column a length', () => {
    // MySQL cannot index an unbounded TEXT column and cannot index JSON at all.
    for (const table of tables) {
      const indexed = new Set<string>();
      for (const column of table.columns) {
        if (column.primaryKey === true || column.references !== undefined) indexed.add(column.prop);
      }
      for (const column of table.primaryKey ?? []) indexed.add(column);
      for (const index of table.indexes ?? []) {
        for (const column of index.columns) indexed.add(column);
      }

      for (const name of indexed) {
        const column = table.columns.find(
          (candidate) => candidate.prop === name || candidate.column === name,
        );
        expect(column, `${table.name}.${name} does not exist`).toBeDefined();
        expect(column?.type, `${table.name}.${name} is indexed and cannot be JSON`).not.toBe(
          'json',
        );
        if (column?.type === 'text') {
          expect(
            column.length,
            `${table.name}.${column.column} is indexed and needs a length for MySQL`,
          ).toBeTypeOf('number');
        }
      }
    }
  });

  it('keeps every MySQL index key inside the 3072-byte utf8mb4 limit', () => {
    // InnoDB rejects an index key longer than 3072 bytes. Counting text as
    // 4 bytes per character is the worst case for utf8mb4 and keeps the check
    // independent of the database's collation.
    const MYSQL_MAX_INDEX_BYTES = 3072;
    const bytesOf = (table: TableModel, names: string[]): number =>
      names.reduce((total, name) => {
        const column = table.columns.find(
          (candidate) => candidate.prop === name || candidate.column === name,
        );
        if (column === undefined) {
          throw new Error(`${table.name}.${name} does not exist`);
        }
        return total + (column.type === 'text' ? (column.length ?? 0) * 4 : 8);
      }, 0);

    for (const table of tables) {
      const keys = [
        {
          name: 'primary key',
          columns:
            (table.primaryKey ?? []).length > 0
              ? (table.primaryKey as string[])
              : table.columns.filter((column) => column.primaryKey).map((column) => column.prop),
        },
        ...(table.indexes ?? []),
      ];
      for (const key of keys) {
        expect(
          bytesOf(table, key.columns),
          `${table.name}.${key.name} exceeds the MySQL index limit`,
        ).toBeLessThanOrEqual(MYSQL_MAX_INDEX_BYTES);
      }
    }
  });

  it('points every foreign key at a primary key or unique column', () => {
    // PostgreSQL requires the referenced columns to carry a unique constraint.
    for (const table of tables) {
      for (const column of table.columns) {
        if (column.references === undefined) continue;
        const target = tables.find((candidate) => candidate.name === column.references?.table);
        const targetColumn = target?.columns.find(
          (candidate) =>
            candidate.prop === column.references?.column ||
            candidate.column === column.references?.column,
        );
        const singleColumnPrimaryKey =
          (target?.primaryKey ?? []).length === 1 &&
          (target?.primaryKey ?? []).some(
            (name) => name === targetColumn?.prop || name === targetColumn?.column,
          );
        const singleColumnUniqueIndex = (target?.indexes ?? []).some(
          (index) =>
            index.unique === true &&
            index.columns.length === 1 &&
            (index.columns[0] === targetColumn?.prop || index.columns[0] === targetColumn?.column),
        );
        expect(
          targetColumn?.primaryKey === true ||
            targetColumn?.unique === true ||
            singleColumnPrimaryKey ||
            singleColumnUniqueIndex,
          `${table.name}.${column.column} references a non-unique column`,
        ).toBe(true);
      }
    }
  });

  it('only uses SET NULL on nullable foreign keys', () => {
    for (const table of tables) {
      for (const column of table.columns) {
        if (column.references?.onDelete !== 'set null') continue;
        expect(
          column.notNull !== true,
          `${table.name}.${column.column} is NOT NULL and cannot SET NULL`,
        ).toBe(true);
      }
    }
  });

  it('keeps the ownership foreign keys that protect user and player data', () => {
    // These columns were accidentally left without references in an earlier
    // revision of the model, which silently removed every cascade constraint.
    const userReferences = new Set([
      'user_id',
      'author_id',
      'reporter_id',
      'handled_by',
      'actor_id',
      'updated_by',
      'created_by',
      'granted_by',
      'reviewed_by',
    ]);
    for (const table of tables) {
      for (const column of table.columns) {
        if (column.column === 'player_uuid') {
          expect(column.references?.table, `${table.name}.${column.column}`).toBe('player');
        }
        if (userReferences.has(column.column)) {
          expect(column.references?.table, `${table.name}.${column.column}`).toBe('user');
        }
      }
    }
  });
});
