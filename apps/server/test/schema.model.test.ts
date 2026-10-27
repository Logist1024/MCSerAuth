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
});
