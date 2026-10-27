/**
 * One-time SQLite → MySQL/PostgreSQL data copy.
 *
 * The target schema must already exist (`pnpm db:migrate` against the target).
 * The script refuses to write into a non-empty target unless `--truncate` is
 * explicitly passed. Rows are copied in foreign-key order, auto-increment
 * sequences are repaired on PostgreSQL, and every table is verified by row
 * count plus a full-row SHA-256 checksum after the copy.
 *
 * Usage:
 *   SOURCE_DATABASE_URL=./data/mcserauth.db \
 *   TARGET_DATABASE_URL=mysql://user:pass@host/mcserauth \
 *   pnpm db:copy-data -- --truncate
 *
 * Options:
 *   --source <url>       Source SQLite URL/path (default: SOURCE_DATABASE_URL or DATABASE_URL)
 *   --target <url>       Target MySQL/PostgreSQL URL (required)
 *   --truncate           Clear the target tables before copying
 *   --dry-run            Validate schema and print counts without writing
 *   --batch-size <n>     Rows per INSERT batch (default: 200)
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { createConnection } from 'mysql2/promise';
import { Client as PgClient } from 'pg';
import {
  detectDialect,
  redactDatabaseUrl,
  sqliteFilePath,
  type DatabaseDialect,
} from '../src/db/dialect.js';
import {
  tableByName,
  tableOrder,
  type ColumnModel,
  type TableModel,
} from '../src/db/schema/model.js';

export type TargetDialect = Extract<DatabaseDialect, 'mysql' | 'postgres'>;
export type SqlValue = string | number | boolean | null;

interface Options {
  sourceUrl: string;
  targetUrl: string;
  truncate: boolean;
  dryRun: boolean;
  batchSize: number;
}

interface Target {
  readonly dialect: TargetDialect;
  query(sql: string, params?: SqlValue[]): Promise<Record<string, unknown>[]>;
  execute(sql: string, params?: SqlValue[]): Promise<void>;
  columns(table: string): Promise<Set<string>>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
  quote(identifier: string): string;
  placeholder(index: number): string;
}

const HELP = `Usage: pnpm db:copy-data -- --target <url> [options]

Options:
  --source <url>       Source SQLite URL/path (default: SOURCE_DATABASE_URL or DATABASE_URL)
  --target <url>       Target MySQL/PostgreSQL URL (required)
  --truncate           Clear the target tables before copying
  --dry-run            Validate schema and print counts without writing
  --batch-size <n>     Rows per INSERT batch (default: 200)
  --help               Show this help`;

function parseArgs(argv: string[]): Options | null {
  const options: Options = {
    sourceUrl: process.env.SOURCE_DATABASE_URL ?? process.env.DATABASE_URL ?? './data/mcserauth.db',
    targetUrl: process.env.TARGET_DATABASE_URL ?? '',
    truncate: false,
    dryRun: false,
    batchSize: 200,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === '--help' || arg === '-h') return null;
    if (arg === '--truncate') {
      options.truncate = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg.startsWith('--source=')) {
      options.sourceUrl = arg.slice('--source='.length);
      continue;
    }
    if (arg.startsWith('--target=')) {
      options.targetUrl = arg.slice('--target='.length);
      continue;
    }
    if (arg.startsWith('--batch-size=')) {
      options.batchSize = Number(arg.slice('--batch-size='.length));
      continue;
    }
    if (arg === '--source' || arg === '--target' || arg === '--batch-size') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      if (arg === '--source') options.sourceUrl = value;
      else if (arg === '--target') options.targetUrl = value;
      else options.batchSize = Number(value);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.targetUrl.trim() === '') {
    throw new Error('TARGET_DATABASE_URL or --target is required.');
  }
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error('--batch-size must be a positive integer.');
  }
  return options;
}

function openSource(databaseUrl: string): Database.Database {
  const file = sqliteFilePath(databaseUrl);
  if (file === ':memory:') {
    throw new Error('SOURCE_DATABASE_URL must point at a file-based SQLite database.');
  }
  const absolute = path.resolve(process.cwd(), file);
  if (!fs.existsSync(absolute)) {
    throw new Error(`SQLite source database not found: ${absolute}`);
  }
  const sqlite = new Database(absolute, { readonly: true, fileMustExist: true });
  sqlite.pragma('query_only = ON');
  return sqlite;
}

function createTarget(dialect: TargetDialect, databaseUrl: string): Target {
  if (dialect === 'mysql') return new MySqlTarget(databaseUrl);
  return new PostgresTarget(databaseUrl);
}

class MySqlTarget implements Target {
  readonly dialect = 'mysql' as const;
  private readonly connection;

  constructor(databaseUrl: string) {
    const url = new URL(databaseUrl.replace(/^mysql2:\/\//i, 'mysql://'));
    this.connection = createConnection({
      host: url.hostname,
      port: url.port === '' ? 3306 : Number(url.port),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, '')),
      timezone: 'Z',
      dateStrings: false,
      supportBigNumbers: true,
      bigNumberStrings: true,
      charset: 'utf8mb4',
    });
  }

  private timezoneReady: Promise<void> | null = null;

  private async connect() {
    const connection = await this.connection;
    // Verification converts DATETIME to epoch with UNIX_TIMESTAMP(), which
    // interprets the value in the session time zone. Pin it to UTC so the
    // checksum matches the SQLite source regardless of the server's TZ.
    this.timezoneReady ??= connection.query("SET time_zone = '+00:00'").then(() => undefined);
    await this.timezoneReady;
    return connection;
  }

  async query(sql: string, params: SqlValue[] = []): Promise<Record<string, unknown>[]> {
    const connection = await this.connect();
    const [rows] = await connection.query(sql, params);
    return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  }

  async execute(sql: string, params: SqlValue[] = []): Promise<void> {
    const connection = await this.connect();
    await connection.query(sql, params);
  }

  async columns(table: string): Promise<Set<string>> {
    const rows = await this.query(
      'SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS ' +
        'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
      [table],
    );
    return new Set(rows.map((row) => String(row.name)));
  }

  async begin(): Promise<void> {
    await (await this.connect()).beginTransaction();
  }

  async commit(): Promise<void> {
    await (await this.connect()).commit();
  }

  async rollback(): Promise<void> {
    await (await this.connect()).rollback();
  }

  async close(): Promise<void> {
    await (await this.connect()).end();
  }

  quote(identifier: string): string {
    return `\`${identifier.replaceAll('`', '``')}\``;
  }

  placeholder(): string {
    return '?';
  }
}

class PostgresTarget implements Target {
  readonly dialect = 'postgres' as const;
  private readonly client: PgClient;

  constructor(databaseUrl: string) {
    this.client = new PgClient({ connectionString: databaseUrl });
  }

  private async connect(): Promise<void> {
    if (this.connected) return;
    await this.client.connect();
    this.connected = true;
  }

  private connected = false;

  async query(sql: string, params: SqlValue[] = []): Promise<Record<string, unknown>[]> {
    await this.connect();
    const result = await this.client.query(sql, params);
    return result.rows as Record<string, unknown>[];
  }

  async execute(sql: string, params: SqlValue[] = []): Promise<void> {
    await this.query(sql, params);
  }

  async columns(table: string): Promise<Set<string>> {
    const rows = await this.query(
      'SELECT column_name AS name FROM information_schema.columns ' +
        'WHERE table_schema = current_schema() AND table_name = $1',
      [table],
    );
    return new Set(rows.map((row) => String(row.name)));
  }

  async begin(): Promise<void> {
    await this.execute('BEGIN');
  }

  async commit(): Promise<void> {
    await this.execute('COMMIT');
  }

  async rollback(): Promise<void> {
    await this.execute('ROLLBACK');
  }

  async close(): Promise<void> {
    await this.client.end();
  }

  quote(identifier: string): string {
    return `"${identifier.replaceAll('"', '""')}"`;
  }

  placeholder(index: number): string {
    return `$${index}`;
  }
}

function quoteSqlite(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function sourceSelect(table: TableModel, sourceColumns: Set<string>): string {
  return table.columns
    .map((column) => {
      if (sourceColumns.has(column.column)) {
        const reference = quoteSqlite(column.column);
        // Drizzle's SQLite `timestamp` mode stores epoch **seconds** while the
        // target-side expressions below produce epoch milliseconds. Normalize
        // here so inserts and checksums use the same unit.
        return column.type === 'timestamp' ? `${reference} * 1000 AS ${reference}` : reference;
      }
      if (table.name === 'skin' && column.column === 'active_slot') {
        return (
          `CASE WHEN ${quoteSqlite('is_active')} = 1 THEN ` +
          `${quoteSqlite('player_uuid')} || ':' || ${quoteSqlite('kind')} ELSE NULL END ` +
          `AS ${quoteSqlite('active_slot')}`
        );
      }
      throw new Error(`Source table ${table.name} is missing column ${column.column}`);
    })
    .join(', ');
}

function targetSelect(table: TableModel, target: Target): string {
  return table.columns
    .map((column) => {
      if (column.type !== 'timestamp') return target.quote(column.column);
      const expression =
        target.dialect === 'mysql'
          ? `CAST(UNIX_TIMESTAMP(${target.quote(column.column)}) * 1000 AS SIGNED)`
          : `CAST(EXTRACT(EPOCH FROM ${target.quote(column.column)}) * 1000 AS BIGINT)`;
      return `${expression} AS ${target.quote(column.column)}`;
    })
    .join(', ');
}

function orderedTables(): TableModel[] {
  return tableOrder.map((name) => tableByName(name));
}

function sourceColumns(sqlite: Database.Database, table: TableModel): Set<string> {
  const rows = sqlite.prepare(`PRAGMA table_info(${quoteSqlite(table.name)})`).all() as Array<{
    name: string;
  }>;
  return new Set(rows.map((row) => row.name));
}

async function preflight(
  sqlite: Database.Database,
  target: Target,
): Promise<{ sourceColumnsByTable: Map<string, Set<string>> }> {
  const sourceColumnsByTable = new Map<string, Set<string>>();
  const errors: string[] = [];

  for (const table of orderedTables()) {
    const sourceSet = sourceColumns(sqlite, table);
    sourceColumnsByTable.set(table.name, sourceSet);
    const targetSet = await target.columns(table.name);
    if (targetSet.size === 0) {
      errors.push(`target is missing table ${table.name}`);
      continue;
    }
    for (const column of table.columns) {
      const derived =
        table.name === 'skin' && column.column === 'active_slot' && !sourceSet.has(column.column);
      if (!sourceSet.has(column.column) && !derived) {
        errors.push(`source is missing ${table.name}.${column.column}`);
      }
      if (!targetSet.has(column.column)) {
        errors.push(`target is missing ${table.name}.${column.column}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      'Schema preflight failed:\n' +
        errors.map((error) => `  - ${error}`).join('\n') +
        '\nRun migrations on both databases before copying.',
    );
  }
  return { sourceColumnsByTable };
}

function sourceCount(sqlite: Database.Database, table: TableModel): number {
  const row = sqlite.prepare(`SELECT COUNT(*) AS n FROM ${quoteSqlite(table.name)}`).get() as
    { n: number } | undefined;
  return Number(row?.n ?? 0);
}

async function targetCount(target: Target, table: TableModel): Promise<number> {
  const rows = await target.query(`SELECT COUNT(*) AS n FROM ${target.quote(table.name)}`);
  return Number(rows[0]?.n ?? 0);
}

async function clearTarget(target: Target): Promise<void> {
  const tables = orderedTables();
  if (target.dialect === 'mysql') {
    await target.execute('SET FOREIGN_KEY_CHECKS=0');
    try {
      for (const table of [...tables].reverse()) {
        await target.execute(`TRUNCATE TABLE ${target.quote(table.name)}`);
      }
    } finally {
      await target.execute('SET FOREIGN_KEY_CHECKS=1');
    }
    return;
  }
  await target.execute(
    `TRUNCATE TABLE ${tables.map((table) => target.quote(table.name)).join(', ')} ` +
      'RESTART IDENTITY CASCADE',
  );
}

export function formatTimestamp(value: unknown): string {
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp value: ${String(value)}`);
  }
  return date.toISOString().slice(0, 23).replace('T', ' ');
}

export function toTargetValues(
  table: TableModel,
  row: Record<string, unknown>,
  dialect: TargetDialect,
): SqlValue[] {
  return table.columns.map((column) => {
    const raw = row[column.column];
    if (raw === null || raw === undefined) return null;
    switch (column.type) {
      case 'timestamp':
        return formatTimestamp(raw);
      case 'boolean':
        return dialect === 'mysql' ? (raw ? 1 : 0) : raw === true || raw === 1 || raw === '1';
      case 'json':
        return typeof raw === 'string' ? raw : JSON.stringify(raw);
      default:
        return raw as SqlValue;
    }
  });
}

async function insertBatch(target: Target, table: TableModel, rows: SqlValue[][]): Promise<void> {
  if (rows.length === 0) return;
  const columns = table.columns.map((column) => target.quote(column.column)).join(', ');
  const values = rows
    .map(
      (_, rowIndex) =>
        `(${table.columns
          .map((__, columnIndex) =>
            target.placeholder(rowIndex * table.columns.length + columnIndex + 1),
          )
          .join(', ')})`,
    )
    .join(', ');
  await target.execute(
    `INSERT INTO ${target.quote(table.name)} (${columns}) VALUES ${values}`,
    rows.flat(),
  );
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, canonicalJson(object[key])]),
    );
  }
  return value;
}

function normalizeValue(column: ColumnModel, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  switch (column.type) {
    case 'timestamp':
      if (value instanceof Date) return value.getTime();
      if (typeof value === 'string' && !/^-?\d+$/.test(value)) {
        return new Date(value).getTime();
      }
      return Number(value);
    case 'boolean':
      return value === true || value === 1 || value === '1' ? 1 : 0;
    case 'json':
      if (typeof value === 'string') {
        try {
          return canonicalJson(JSON.parse(value) as unknown);
        } catch {
          return value;
        }
      }
      return canonicalJson(value);
    default:
      if (Buffer.isBuffer(value)) return value.toString('hex');
      return value;
  }
}

export function rowHash(table: TableModel, row: Record<string, unknown>): string {
  const normalized = table.columns.map((column) => normalizeValue(column, row[column.column]));
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function tableChecksum(hashes: string[]): string {
  const digest = createHash('sha256');
  for (const hash of hashes.sort()) digest.update(hash);
  return digest.digest('hex');
}

/**
 * Orders rows of a self-referencing table (for example `category.parent_id`)
 * so that parents are inserted before their children. Rows that point at a
 * missing key are left in place; the target foreign key reports them.
 */
export function orderSelfReferencedRows(
  table: TableModel,
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const selfReferences = table.columns.filter((column) => column.references?.table === table.name);
  if (selfReferences.length === 0) return rows;

  const primary = table.columns.find((column) => column.primaryKey);
  if (primary === undefined) {
    throw new Error(`Self-referencing table ${table.name} must have a primary key.`);
  }

  const knownKeys = new Set(rows.map((row) => String(row[primary.column])));
  const placed = new Set<string>();
  const pending = [...rows];
  const ordered: Record<string, unknown>[] = [];

  while (pending.length > 0) {
    let progressed = false;
    for (let index = 0; index < pending.length;) {
      const row = pending[index]!;
      const ready = selfReferences.every((column) => {
        const value = row[column.column];
        if (value === null || value === undefined) return true;
        const key = String(value);
        return !knownKeys.has(key) || placed.has(key);
      });
      if (!ready) {
        index += 1;
        continue;
      }
      ordered.push(row);
      placed.add(String(row[primary.column]));
      pending.splice(index, 1);
      progressed = true;
    }
    if (!progressed) {
      throw new Error(
        `Cannot order ${table.name} rows: the self-reference contains a cycle. ` +
          'Fix the source data before copying.',
      );
    }
  }

  return ordered;
}

function* sourceRows(
  sqlite: Database.Database,
  table: TableModel,
  sourceColumnsSet: Set<string>,
): Iterable<Record<string, unknown>> {
  const select = `SELECT ${sourceSelect(table, sourceColumnsSet)} FROM ${quoteSqlite(table.name)}`;
  const rows = sqlite.prepare(select).iterate() as Iterable<Record<string, unknown>>;
  if (table.columns.every((column) => column.references?.table !== table.name)) {
    yield* rows;
    return;
  }
  yield* orderSelfReferencedRows(table, [...rows]);
}

async function copyTable(
  sqlite: Database.Database,
  target: Target,
  table: TableModel,
  sourceColumnsSet: Set<string>,
  batchSize: number,
): Promise<number> {
  let count = 0;
  let batch: SqlValue[][] = [];
  for (const row of sourceRows(sqlite, table, sourceColumnsSet)) {
    batch.push(toTargetValues(table, row, target.dialect));
    count += 1;
    if (batch.length >= batchSize) {
      await insertBatch(target, table, batch);
      batch = [];
    }
  }
  await insertBatch(target, table, batch);
  return count;
}

async function resetPostgresSequences(target: Target): Promise<void> {
  if (target.dialect !== 'postgres') return;
  for (const table of orderedTables()) {
    const primary = table.columns.find((column) => column.primaryKey && column.autoIncrement);
    if (primary === undefined) continue;
    const sequenceRows = await target.query('SELECT pg_get_serial_sequence($1, $2) AS seq', [
      table.name,
      primary.column,
    ]);
    const sequence = sequenceRows[0]?.seq;
    if (typeof sequence !== 'string' || sequence === '') continue;
    const maxRows = await target.query(
      `SELECT COALESCE(MAX(${target.quote(primary.column)}), 0) AS max ` +
        `FROM ${target.quote(table.name)}`,
    );
    const max = Number(maxRows[0]?.max ?? 0);
    await target.query('SELECT setval($1::regclass, $2, $3)', [
      sequence,
      max > 0 ? max : 1,
      max > 0,
    ]);
  }
}

async function verify(
  sqlite: Database.Database,
  target: Target,
  sourceColumnsByTable: Map<string, Set<string>>,
): Promise<void> {
  for (const table of orderedTables()) {
    const sourceColumnsSet = sourceColumnsByTable.get(table.name);
    if (sourceColumnsSet === undefined) throw new Error(`No source columns for ${table.name}`);
    const sourceRows = sqlite
      .prepare(`SELECT ${sourceSelect(table, sourceColumnsSet)} FROM ${quoteSqlite(table.name)}`)
      .all() as Array<Record<string, unknown>>;
    const targetRows = await target.query(
      `SELECT ${targetSelect(table, target)} FROM ${target.quote(table.name)}`,
    );
    if (sourceRows.length !== targetRows.length) {
      throw new Error(
        `Row count mismatch for ${table.name}: source=${sourceRows.length} target=${targetRows.length}`,
      );
    }
    const sourceChecksum = tableChecksum(sourceRows.map((row) => rowHash(table, row)));
    const targetChecksum = tableChecksum(targetRows.map((row) => rowHash(table, row)));
    if (sourceChecksum !== targetChecksum) {
      throw new Error(
        `Checksum mismatch for ${table.name} (${sourceRows.length} rows). ` +
          'The target was not committed; re-run after checking the schema.',
      );
    }
    console.log(`  verified ${table.name}: ${sourceRows.length} rows`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options === null) {
    console.log(HELP);
    return;
  }

  const sourceDialect = detectDialect(options.sourceUrl);
  const targetDialect = detectDialect(options.targetUrl);
  if (sourceDialect !== 'sqlite') {
    throw new Error('Source database must be SQLite.');
  }
  if (targetDialect !== 'mysql' && targetDialect !== 'postgres') {
    throw new Error('Target database must be MySQL or PostgreSQL.');
  }

  console.log(`Source: ${redactDatabaseUrl(options.sourceUrl)}`);
  console.log(`Target: ${redactDatabaseUrl(options.targetUrl)} (${targetDialect})`);
  if (options.dryRun) console.log('Dry run: no data will be written.');

  const sqlite = openSource(options.sourceUrl);
  const target = createTarget(targetDialect, options.targetUrl);
  try {
    const { sourceColumnsByTable } = await preflight(sqlite, target);

    const sourceCounts = new Map<string, number>();
    const targetCounts = new Map<string, number>();
    for (const table of orderedTables()) {
      sourceCounts.set(table.name, sourceCount(sqlite, table));
      targetCounts.set(table.name, await targetCount(target, table));
    }
    const nonEmptyTarget = [...targetCounts.entries()].filter(([, count]) => count > 0);
    if (nonEmptyTarget.length > 0 && !options.truncate && !options.dryRun) {
      throw new Error(
        'Target is not empty:\n' +
          nonEmptyTarget.map(([name, count]) => `  - ${name}: ${count}`).join('\n') +
          '\nPass --truncate to replace its contents.',
      );
    }

    if (options.dryRun) {
      console.log('\nSource / target row counts:');
      for (const table of orderedTables()) {
        console.log(
          `  ${table.name}: ${sourceCounts.get(table.name) ?? 0} -> ` +
            `${targetCounts.get(table.name) ?? 0}`,
        );
      }
      return;
    }

    if (options.truncate) {
      console.log('\nClearing target tables...');
      await clearTarget(target);
    }

    console.log('\nCopying data...');
    await target.begin();
    try {
      for (const table of orderedTables()) {
        const sourceColumnsSet = sourceColumnsByTable.get(table.name);
        if (sourceColumnsSet === undefined) throw new Error(`No source columns for ${table.name}`);
        const count = await copyTable(sqlite, target, table, sourceColumnsSet, options.batchSize);
        console.log(`  copied ${table.name}: ${count} rows`);
      }
      await resetPostgresSequences(target);

      console.log('\nVerifying copied data...');
      await verify(sqlite, target, sourceColumnsByTable);
      await target.commit();
    } catch (error) {
      await target.rollback();
      throw error;
    }

    console.log('\nCopy complete: all tables match by row count and checksum.');
  } finally {
    sqlite.close();
    await target.close();
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(`\nCopy failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
