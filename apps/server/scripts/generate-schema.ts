/**
 * Generates dialect-specific Drizzle schemas and the runtime facade from the
 * single logical model in `src/db/schema/model.ts`.
 *
 * Usage: pnpm --filter @mcserauth/server db:generate:schemas
 *
 * The generated files are committed so that drizzle-kit, the Nest build and
 * editors all work without an extra build step. CI runs this script and fails
 * if the working tree changes, which prevents model/schema drift.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  tableOrder,
  tables,
  type ColumnModel,
  type DatabaseDialect,
  type TableModel,
} from '../src/db/schema/model.js';

const root = path.resolve(import.meta.dirname, '..');
const schemaDir = path.join(root, 'src', 'db', 'schema');
const generatedDir = path.join(schemaDir, 'generated');

interface DialectSpec {
  dialect: DatabaseDialect;
  tableFactory: string;
  anyColumn: string;
  jsonType: string;
  autoIncrement: (column: string) => string;
  text: (column: string, length?: number) => string;
}

const specs: DialectSpec[] = [
  {
    dialect: 'sqlite',
    tableFactory: 'sqliteTable',
    anyColumn: 'AnySQLiteColumn',
    jsonType: 'json',
    autoIncrement: (column) => `integer(${column}).primaryKey({ autoIncrement: true })`,
    text: (column) => `text(${column})`,
  },
  {
    dialect: 'mysql',
    tableFactory: 'mysqlTable',
    anyColumn: 'AnyMySqlColumn',
    jsonType: 'json',
    autoIncrement: (column) => `int(${column}).autoincrement().primaryKey()`,
    text: (column, length) =>
      length === undefined ? `text(${column})` : `varchar(${column}, { length: ${length} })`,
  },
  {
    dialect: 'postgres',
    tableFactory: 'pgTable',
    anyColumn: 'AnyPgColumn',
    jsonType: 'jsonb',
    autoIncrement: (column) => `serial(${column}).primaryKey()`,
    text: (column, length) =>
      length === undefined ? `text(${column})` : `varchar(${column}, { length: ${length} })`,
  },
];

function exportName(tableName: string): string {
  return tableName.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function quote(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function literal(value: string | number | boolean): string {
  if (typeof value === 'string') return quote(value);
  return String(value);
}

function columnType(spec: DialectSpec, column: ColumnModel): string {
  const name = quote(column.column);
  switch (column.type) {
    case 'text':
      return spec.text(name, column.length);
    case 'integer':
      return spec.dialect === 'mysql' ? `int(${name})` : `integer(${name})`;
    case 'boolean':
      return spec.dialect === 'sqlite'
        ? `integer(${name}, { mode: 'boolean' })`
        : `boolean(${name})`;
    case 'timestamp':
      if (spec.dialect === 'sqlite') return `integer(${name}, { mode: 'timestamp' })`;
      if (spec.dialect === 'mysql') return `datetime(${name}, { mode: 'date', fsp: 3 })`;
      return `timestamp(${name}, { mode: 'date', withTimezone: false })`;
    case 'json':
      if (spec.dialect === 'sqlite') return `text(${name}, { mode: 'json' })`;
      return `${spec.jsonType}(${name})`;
  }
}

function columnExpression(spec: DialectSpec, table: TableModel, column: ColumnModel): string {
  if (column.primaryKey && column.autoIncrement) {
    return spec.autoIncrement(quote(column.column));
  }

  let expression = columnType(spec, column);
  if (column.tsType !== undefined) {
    expression += `.$type<${column.tsType}>()`;
  }
  if (column.notNull) {
    expression += '.notNull()';
  }
  if (column.default !== undefined) {
    expression += `.default(${literal(column.default)})`;
  }
  if (column.defaultFn === 'now') {
    expression += '.$defaultFn(() => new Date())';
  } else if (column.defaultFn === 'emptyArray') {
    expression += '.$defaultFn(() => [])';
  }
  if (column.references !== undefined) {
    const reference = column.references;
    const targetTable = exportName(reference.table);
    const target = `() => ${targetTable}.${columnProp(reference.table, reference.column)}`;
    const callback =
      reference.table === table.name
        ? `(): ${spec.anyColumn} => ${targetTable}.${columnProp(reference.table, reference.column)}`
        : target;
    const onDelete =
      reference.onDelete === undefined ? '' : `, { onDelete: '${reference.onDelete}' }`;
    expression += `.references(${callback}${onDelete})`;
  }
  if (column.unique) {
    expression += '.unique()';
  }
  if (column.primaryKey) {
    expression += '.primaryKey()';
  }
  return expression;
}

function columnProp(tableName: string, columnName: string): string {
  const table = tables.find((candidate) => candidate.name === tableName);
  if (!table) throw new Error(`Unknown table ${tableName}`);
  const column = table.columns.find(
    (candidate) => candidate.prop === columnName || candidate.column === columnName,
  );
  if (!column) throw new Error(`Unknown column ${tableName}.${columnName}`);
  return column.prop;
}

function tableImports(spec: DialectSpec): string[] {
  const used = new Set<string>([spec.tableFactory, 'index', 'primaryKey', 'uniqueIndex']);
  for (const table of tables) {
    for (const column of table.columns) {
      if (column.primaryKey && column.autoIncrement) {
        used.add(
          spec.dialect === 'mysql' ? 'int' : spec.dialect === 'postgres' ? 'serial' : 'integer',
        );
      } else {
        switch (column.type) {
          case 'text':
            if (spec.dialect === 'sqlite') used.add('text');
            else used.add(column.length === undefined ? 'text' : 'varchar');
            break;
          case 'integer':
            used.add(spec.dialect === 'mysql' ? 'int' : 'integer');
            break;
          case 'boolean':
            used.add(spec.dialect === 'sqlite' ? 'integer' : 'boolean');
            break;
          case 'timestamp':
            if (spec.dialect === 'sqlite') used.add('integer');
            else if (spec.dialect === 'mysql') used.add('datetime');
            else used.add('timestamp');
            break;
          case 'json':
            if (spec.dialect === 'sqlite') used.add('text');
            else used.add(spec.jsonType);
            break;
        }
      }
      if (column.references !== undefined && column.references.table === table.name) {
        used.add(`type ${spec.anyColumn}`);
      }
    }
  }
  return [...used].sort();
}

function sharedTypeImports(): string[] {
  const names = new Set<string>();
  for (const table of tables) {
    for (const column of table.columns) {
      if (column.tsType === undefined) continue;
      for (const match of column.tsType.matchAll(/typeof\s+([A-Z0-9_]+)/g)) {
        names.add(match[1]!);
      }
    }
  }
  return [...names].sort();
}

function emitTable(spec: DialectSpec, table: TableModel): string {
  const lines: string[] = [];
  lines.push(
    `export const ${exportName(table.name)} = ${spec.tableFactory}(${quote(table.name)}, {`,
  );
  for (const column of table.columns) {
    lines.push(`  ${column.prop}: ${columnExpression(spec, table, column)},`);
  }
  const constraints: string[] = [];
  for (const index of table.indexes ?? []) {
    const builder = index.unique === true ? 'uniqueIndex' : 'index';
    const columns = index.columns.map((column) => `t.${columnProp(table.name, column)}`).join(', ');
    constraints.push(`  ${builder}(${quote(index.name)}).on(${columns}),`);
  }
  if (table.primaryKey !== undefined) {
    const columns = table.primaryKey
      .map((column) => `t.${columnProp(table.name, column)}`)
      .join(', ');
    constraints.push(`  primaryKey({ columns: [${columns}] }),`);
  }

  if (constraints.length > 0) {
    lines.push('}, (t) => [');
    lines.push(...constraints);
    lines.push(']);');
  } else {
    lines.push('});');
  }
  return lines.join('\n');
}

function emitDialect(spec: DialectSpec): string {
  const imports = tableImports(spec);
  const typeImports = sharedTypeImports();
  const header = [
    '/* eslint-disable */',
    '// AUTO-GENERATED by scripts/generate-schema.ts — edit src/db/schema/model.ts instead.',
    `// Dialect: ${spec.dialect}`,
    `import { ${imports.join(', ')} } from 'drizzle-orm/${spec.dialect === 'postgres' ? 'pg' : spec.dialect}-core';`,
  ];
  if (typeImports.length > 0) {
    header.push(`import type { ${typeImports.join(', ')} } from '@mcserauth/shared';`);
  }
  header.push('');

  const ordered = tableOrder.map((name) => {
    const table = tables.find((candidate) => candidate.name === name);
    if (!table) throw new Error(`tableOrder references missing table ${name}`);
    return table;
  });
  if (ordered.length !== tables.length) {
    throw new Error('tableOrder must list every table exactly once');
  }

  return [...header, ...ordered.map((table) => emitTable(spec, table))].join('\n\n') + '\n';
}

function emitFacade(): string {
  const names = tableOrder.map(exportName);
  const lines: string[] = [
    '/* eslint-disable */',
    '// AUTO-GENERATED by scripts/generate-schema.ts — edit src/db/schema/model.ts instead.',
    "import * as mysqlSchemaRuntime from './generated/mysql.js';",
    "import type * as postgresSchema from './generated/postgres.js';",
    "import * as postgresSchemaRuntime from './generated/postgres.js';",
    "import * as sqliteSchemaRuntime from './generated/sqlite.js';",
    '',
    "export type { DatabaseDialect } from './model.js';",
    "import type { DatabaseDialect } from './model.js';",
    '',
    'export type Schema = typeof postgresSchema;',
    '',
    "let activeDialect: DatabaseDialect = 'sqlite';",
    '',
  ];

  for (const name of names) {
    lines.push(`export let ${name}: Schema['${name}'] = undefined as never;`);
  }
  lines.push('');
  lines.push('export function activateSchema(dialect: DatabaseDialect): void {');
  lines.push('  activeDialect = dialect;');
  lines.push('  const schema = schemaFor(dialect);');
  for (const name of names) {
    lines.push(`  ${name} = schema.${name};`);
  }
  lines.push('}');
  lines.push('');
  lines.push('export function schemaFor(dialect: DatabaseDialect): Schema {');
  lines.push("  if (dialect === 'sqlite') return sqliteSchemaRuntime as unknown as Schema;");
  lines.push("  if (dialect === 'mysql') return mysqlSchemaRuntime as unknown as Schema;");
  lines.push('  return postgresSchemaRuntime as unknown as Schema;');
  lines.push('}');
  lines.push('');
  lines.push('export function getActiveSchema(): Schema {');
  lines.push('  return schemaFor(activeDialect);');
  lines.push('}');
  lines.push('');
  lines.push('export function getActiveDialect(): DatabaseDialect {');
  lines.push('  return activeDialect;');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

fs.mkdirSync(generatedDir, { recursive: true });
for (const spec of specs) {
  const file = path.join(generatedDir, `${spec.dialect}.ts`);
  fs.writeFileSync(file, emitDialect(spec), 'utf8');
  console.log(`generated ${path.relative(root, file)}`);
}
fs.writeFileSync(path.join(schemaDir, 'index.ts'), emitFacade(), 'utf8');
console.log('generated src/db/schema/index.ts');
