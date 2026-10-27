import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import Database from 'better-sqlite3';
import {
  getTableColumns,
  inArray,
  sql,
  type InferInsertModel,
  type InferSelectModel,
  type SQL,
} from 'drizzle-orm';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzleMysql } from 'drizzle-orm/mysql2';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { createPool as createMySqlPool, type Pool as MySqlPool } from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import { Pool as PgPool } from 'pg';
import { AppConfigService } from '../config/app-config.service.js';
import { detectDialect, sqliteFilePath, type DatabaseDialect } from './dialect.js';
import { activateSchema, getActiveSchema, type Schema } from './schema/index.js';

/**
 * Canonical query type.
 *
 * The application is written against the PostgreSQL shape because it is the
 * most expressive of the three dialects. At runtime the object is a SQLite,
 * MySQL or PostgreSQL Drizzle instance; the generated table objects are the
 * real dialect-specific ones (see `schema/index.ts`). This keeps full column
 * type-safety in application code without duplicating every query per dialect.
 */
export type CanonicalDb = NodePgDatabase<Schema>;

/** Minimal structural view of the MySQL insert builder used by helpers. */
interface MySqlInsertLike {
  values(values: unknown): MySqlInsertLike;
  onDuplicateKeyUpdate(config: { set: Record<string, unknown> }): MySqlInsertLike;
  $returningId(): Promise<Array<Record<string, number>>>;
}

interface MySqlExecutorLike {
  insert(table: unknown): MySqlInsertLike;
}

interface TransactionCapable {
  transaction<T>(callback: (tx: unknown) => Promise<T>): Promise<T>;
}

export interface UpsertConfig {
  /** Conflict target. Used by SQLite/PostgreSQL; MySQL relies on its unique keys. */
  target: PgColumn | PgColumn[];
  set: Record<string, unknown>;
}

/**
 * One connection pool per process, selected by `DATABASE_URL`.
 *
 * SQLite keeps WAL + foreign keys + a busy timeout. MySQL/PostgreSQL use a
 * bounded pool with UTC date handling. All application code talks to the
 * canonical Drizzle facade, so dialect differences stay in this class and in
 * the generated schema/migration folders.
 */
@Injectable()
export class DbService implements OnModuleDestroy {
  readonly dialect: DatabaseDialect;
  readonly db: CanonicalDb;
  readonly schema: Schema;
  readonly sqlite: Database.Database | null = null;

  private readonly mysqlPool: MySqlPool | null = null;
  private readonly pgPool: PgPool | null = null;
  /**
   * The active transaction executor for the current async call chain. A plain
   * depth counter would let one request observe another request's transaction
   * and run its queries on the wrong connection, so the context is async-local.
   */
  private readonly transactionContext = new AsyncLocalStorage<CanonicalDb>();
  /**
   * SQLite has one connection and one writer. Concurrent top-level
   * transactions must queue instead of issuing nested `BEGIN IMMEDIATE`
   * statements on the same connection.
   */
  private sqliteTransactionTail: Promise<void> = Promise.resolve();

  constructor(config: AppConfigService) {
    this.dialect = detectDialect(config.databaseUrl, config.env.DB_DIALECT);
    activateSchema(this.dialect);
    this.schema = getActiveSchema();

    if (this.dialect === 'sqlite') {
      const file = sqliteFilePath(config.databaseUrl);
      if (file !== ':memory:') {
        const absolute = path.resolve(process.cwd(), file);
        fs.mkdirSync(path.dirname(absolute), { recursive: true });
        this.sqlite = new Database(absolute);
      } else {
        this.sqlite = new Database(':memory:');
      }
      this.sqlite.pragma('journal_mode = WAL');
      this.sqlite.pragma('foreign_keys = ON');
      this.sqlite.pragma('busy_timeout = 5000');
      this.db = drizzleSqlite(this.sqlite, {
        schema: this.schema as never,
      }) as unknown as CanonicalDb;
      return;
    }

    if (this.dialect === 'mysql') {
      this.mysqlPool = createMySqlPool({
        ...parseMySqlUrl(config.databaseUrl),
        connectionLimit: config.dbPoolMax,
        // mysql2 has no "minimum idle" option; keep the pool warm up to the
        // configured maximum and let idleTimeout reap it.
        maxIdle: config.dbPoolMax,
        idleTimeout: config.dbIdleTimeoutMs,
        connectTimeout: config.dbConnectionTimeoutMs,
        waitForConnections: true,
        timezone: 'Z',
        dateStrings: false,
        // Keep BIGINT/DECIMAL safe, but do not force every big number to a
        // string: `count()` returns BIGINT on MySQL and the API exposes those
        // values as numbers. mysql2 still falls back to strings when a value
        // cannot be represented exactly.
        supportBigNumbers: true,
        // Verify the server certificate when TLS is enabled. Private CAs can
        // be supplied through NODE_EXTRA_CA_CERTS.
        ssl: config.dbSsl ? { rejectUnauthorized: true } : undefined,
      });
      this.db = drizzleMysql(this.mysqlPool, {
        schema: this.schema as never,
        mode: 'default',
      }) as unknown as CanonicalDb;
      return;
    }

    this.pgPool = new PgPool({
      connectionString: config.databaseUrl,
      min: config.dbPoolMin,
      max: config.dbPoolMax,
      connectionTimeoutMillis: config.dbConnectionTimeoutMs,
      idleTimeoutMillis: config.dbIdleTimeoutMs,
      ssl: config.dbSsl ? { rejectUnauthorized: true } : undefined,
    });
    this.db = drizzlePg(this.pgPool, { schema: this.schema as never });
  }

  /** Cheap readiness probe used by GET /health. */
  async ping(): Promise<boolean> {
    try {
      if (this.sqlite !== null) {
        this.sqlite.prepare('select 1 as ok').get();
        return true;
      }
      if (this.mysqlPool !== null) {
        await this.mysqlPool.query('select 1');
        return true;
      }
      if (this.pgPool !== null) {
        await this.pgPool.query('select 1');
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Runs `fn` in a transaction. The callback receives the canonical executor;
   * use the helpers on this service (`insertReturning`, `upsert`, ...) with the
   * provided executor so dialect differences stay centralized.
   */
  async transaction<T>(fn: (tx: CanonicalDb) => Promise<T>): Promise<T> {
    const active = this.transactionContext.getStore();
    if (active !== undefined) {
      return fn(active);
    }

    if (this.sqlite !== null) {
      let release!: () => void;
      const previous = this.sqliteTransactionTail;
      this.sqliteTransactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        this.sqlite.exec('BEGIN IMMEDIATE');
        try {
          const result = await this.transactionContext.run(this.db, () => fn(this.db));
          this.sqlite.exec('COMMIT');
          return result;
        } catch (error) {
          this.sqlite.exec('ROLLBACK');
          throw error;
        }
      } finally {
        release();
      }
    }

    const db = this.db as unknown as TransactionCapable;
    return await db.transaction((tx) =>
      this.transactionContext.run(tx as CanonicalDb, () => fn(tx as CanonicalDb)),
    );
  }

  /**
   * INSERT ... RETURNING across dialects.
   *
   * MySQL has no RETURNING. It uses `$returningId()` for auto-increment keys and
   * then re-selects the rows; callers get the same `InferSelectModel` shape.
   */
  async insertReturning<TTable extends PgTable>(
    table: TTable,
    values: InferInsertModel<TTable> | InferInsertModel<TTable>[],
    executor: CanonicalDb = this.db,
  ): Promise<InferSelectModel<TTable>[]> {
    if (this.dialect !== 'mysql') {
      const rows = await executor
        .insert(table)
        .values(values as never)
        .returning();
      return rows as InferSelectModel<TTable>[];
    }

    const inserted = await (executor as unknown as MySqlExecutorLike)
      .insert(table)
      .values(values)
      .$returningId();

    const primary = primaryKeyOf(table);
    if (primary.primaryCount > 1) {
      throw new Error(
        'insertReturning() on MySQL does not support composite primary keys; use insert() and select() instead.',
      );
    }
    const { primaryProp, primaryColumn } = primary;

    // MySQL's `$returningId()` only reports auto-increment keys. When the
    // caller supplied the primary key explicitly (for example a text id),
    // reuse those values so the row can still be re-selected.
    const inputRows = (Array.isArray(values) ? values : [values]) as Array<Record<string, unknown>>;
    if (inputRows.length === 0) {
      return [];
    }
    const explicitIds = inputRows
      .map((row) => row[primaryProp])
      .filter(
        (value): value is string | number => typeof value === 'string' || typeof value === 'number',
      );

    let ids: Array<string | number>;
    if (explicitIds.length === inputRows.length) {
      ids = explicitIds;
    } else if (explicitIds.length > 0) {
      throw new Error(
        'insertReturning() on MySQL does not support mixing explicit and generated primary keys.',
      );
    } else {
      ids = inserted
        .map((row) => row[primaryProp])
        .filter((value): value is number => typeof value === 'number');
      if (ids.length === 0) {
        throw new Error(
          'insertReturning() on MySQL requires an auto-increment primary key or explicit primary key values.',
        );
      }
    }

    const rows = await executor
      .select()
      .from(table as PgTable)
      .where(inArray(primaryColumn as PgColumn, ids));
    const byId = new Map(
      rows.map((row) => [String((row as Record<string, unknown>)[primaryProp]), row]),
    );
    return ids
      .map((id) => byId.get(String(id)))
      .filter(
        (row): row is (typeof rows)[number] => row !== undefined,
      ) as InferSelectModel<TTable>[];
  }

  /** UPDATE ... RETURNING across dialects. */
  async updateReturning<TTable extends PgTable>(
    table: TTable,
    values: Partial<InferInsertModel<TTable>>,
    where: SQL | undefined,
    executor: CanonicalDb = this.db,
  ): Promise<InferSelectModel<TTable>[]> {
    if (this.dialect !== 'mysql') {
      const rows = await executor
        .update(table)
        .set(values as never)
        .where(where)
        .returning();
      return rows as InferSelectModel<TTable>[];
    }

    const { primaryProp, primaryColumn, primaryCount } = primaryKeyOf(table);
    if (primaryCount > 1) {
      throw new Error(
        'updateReturning() on MySQL does not support composite primary keys; use update() and select() instead.',
      );
    }
    const before = await executor
      .select()
      .from(table as PgTable)
      .where(where);
    if (before.length === 0) {
      return [];
    }
    const result = await executor
      .update(table)
      .set(values as never)
      .where(where);
    // MySQL has no UPDATE ... RETURNING, so callers that rely on a
    // compare-and-swap (claiming an OAuth code or rotating a refresh token)
    // must not get a row back when the conditional update matched nothing.
    if (this.affectedRows(result) === 0) {
      return [];
    }
    const ids = before
      .map((row) => (row as Record<string, unknown>)[primaryProp])
      .filter(
        (value): value is string | number => typeof value === 'string' || typeof value === 'number',
      );
    if (ids.length === 0) {
      return [];
    }
    return (await executor
      .select()
      .from(table as PgTable)
      .where(inArray(primaryColumn as PgColumn, ids))) as InferSelectModel<TTable>[];
  }

  /** INSERT ... ON CONFLICT DO NOTHING (MySQL: no-op ON DUPLICATE KEY UPDATE). */
  async insertIgnore<TTable extends PgTable>(
    table: TTable,
    values: InferInsertModel<TTable> | InferInsertModel<TTable>[],
    executor: CanonicalDb = this.db,
  ): Promise<void> {
    if (this.dialect === 'mysql') {
      // `INSERT IGNORE` also downgrades foreign-key and data errors to
      // warnings. A self-assignment on the primary key only ignores duplicate
      // keys, matching PostgreSQL's `ON CONFLICT DO NOTHING`.
      const { primaryProp, primaryColumn } = primaryKeyOf(table);
      await (executor as unknown as MySqlExecutorLike)
        .insert(table)
        .values(values)
        .onDuplicateKeyUpdate({ set: { [primaryProp]: sql`${primaryColumn}` } });
      return;
    }
    await executor
      .insert(table)
      .values(values as never)
      .onConflictDoNothing();
  }

  /**
   * INSERT ... ON CONFLICT DO UPDATE / ON DUPLICATE KEY UPDATE.
   *
   * MySQL chooses the conflicting unique key itself, so `target` is ignored
   * there. The application only uses single-target upserts.
   */
  async upsert<TTable extends PgTable>(
    table: TTable,
    values: InferInsertModel<TTable> | InferInsertModel<TTable>[],
    config: UpsertConfig,
    executor: CanonicalDb = this.db,
  ): Promise<void> {
    if (this.dialect === 'mysql') {
      await (executor as unknown as MySqlExecutorLike)
        .insert(table)
        .values(values)
        .onDuplicateKeyUpdate({ set: config.set });
      return;
    }
    await executor
      .insert(table)
      .values(values as never)
      .onConflictDoUpdate({
        target: config.target,
        set: config.set as never,
      });
  }

  /**
   * Normalizes the row count of an `update()`/`delete()` result.
   *
   * better-sqlite3 reports `{ changes }`, node-postgres reports `{ rowCount }`
   * and mysql2 reports `[ResultSetHeader]` with `affectedRows`.
   */
  affectedRows(result: unknown): number {
    if (Array.isArray(result)) {
      const [first] = result as Array<{ affectedRows?: number }>;
      return typeof first?.affectedRows === 'number' ? first.affectedRows : 0;
    }
    const record = result as {
      changes?: number;
      rowCount?: number;
      affectedRows?: number;
    } | null;
    return record?.changes ?? record?.rowCount ?? record?.affectedRows ?? 0;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sqlite !== null) {
      // Let queued transactions finish before closing the connection.
      await this.sqliteTransactionTail;
    }
    if (this.sqlite !== null && this.sqlite.open) {
      this.sqlite.close();
    }
    if (this.mysqlPool !== null) {
      await this.mysqlPool.end();
    }
    if (this.pgPool !== null) {
      await this.pgPool.end();
    }
  }
}

function primaryKeyOf(table: PgTable): {
  primaryProp: string;
  primaryColumn: PgColumn;
  primaryCount: number;
} {
  const columns = getTableColumns(table);
  const primary = Object.entries(columns).filter(([, column]) => column.primary);
  const first = primary[0];
  if (first === undefined) {
    throw new Error('The table must have a primary key.');
  }
  return {
    primaryProp: first[0],
    primaryColumn: first[1] as PgColumn,
    primaryCount: primary.length,
  };
}

function parseMySqlUrl(databaseUrl: string): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
} {
  const url = new URL(databaseUrl.replace(/^mysql2:\/\//, 'mysql://'));
  return {
    host: url.hostname,
    port: url.port === '' ? 3306 : Number(url.port),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
  };
}
