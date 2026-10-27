import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppConfigService } from '../../src/config/app-config.service.js';
import { detectDialect, type DatabaseDialect } from '../../src/db/dialect.js';
import { DbService } from '../../src/db/db.service.js';

export interface TestContext {
  db: DbService;
  config: AppConfigService;
  dir: string;
  dialect: DatabaseDialect;
  cleanup: () => Promise<void>;
}

/**
 * Creates an isolated database for one test file.
 *
 * By default a temp-file SQLite database is used. Set `TEST_DATABASE_URL` to a
 * MySQL or PostgreSQL server URL to run the same suite against that dialect;
 * every context creates (and later drops) its own uniquely named database, so
 * test files can run in parallel without sharing state.
 */
export async function createTestContext(): Promise<TestContext> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcserauth-test-'));
  process.env.NODE_ENV = 'test';
  process.env.UPLOAD_DIR = path.join(dir, 'uploads');
  process.env.BETTER_AUTH_SECRET = 'test-secret-0123456789-0123456789-0123456789';
  process.env.APP_URL = 'http://localhost:3000';
  process.env.AUTH_URL = 'http://localhost:8000';
  process.env.COOKIE_SECURE = 'false';

  const baseUrl = process.env.TEST_DATABASE_URL;
  const dialect: DatabaseDialect = baseUrl === undefined ? 'sqlite' : detectDialect(baseUrl);
  const databaseName = `mcserauth_test_${process.pid}_${randomBytes(4).toString('hex')}`;

  let databaseUrl: string;
  let dropDatabase: (() => Promise<void>) | null = null;
  if (dialect === 'sqlite') {
    databaseUrl = path.join(dir, 'test.db');
  } else {
    await createDatabase(baseUrl as string, dialect, databaseName);
    databaseUrl = withDatabaseName(baseUrl as string, databaseName);
    dropDatabase = async () => await dropNamedDatabase(baseUrl as string, dialect, databaseName);
  }

  process.env.DATABASE_URL = databaseUrl;
  process.env.DB_DIALECT = dialect;

  const config = new AppConfigService();
  const db = new DbService(config);
  await migrate(db, dialect);

  return {
    db,
    config,
    dir,
    dialect,
    cleanup: async () => {
      await db.onModuleDestroy();
      if (dropDatabase !== null) {
        await dropDatabase();
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function migrate(db: DbService, dialect: DatabaseDialect): Promise<void> {
  const migrationsFolder = path.resolve(
    process.cwd(),
    'drizzle',
    dialect === 'postgres' ? 'postgres' : dialect,
  );
  if (dialect === 'sqlite') {
    const { migrate: run } = await import('drizzle-orm/better-sqlite3/migrator');
    run(db.db as never, { migrationsFolder });
    return;
  }
  if (dialect === 'mysql') {
    const { migrate: run } = await import('drizzle-orm/mysql2/migrator');
    await run(db.db as never, { migrationsFolder });
    return;
  }
  const { migrate: run } = await import('drizzle-orm/node-postgres/migrator');
  await run(db.db as never, { migrationsFolder });
}

async function createDatabase(
  baseUrl: string,
  dialect: DatabaseDialect,
  name: string,
): Promise<void> {
  if (dialect === 'mysql') {
    const { createConnection } = await import('mysql2/promise');
    const url = new URL(baseUrl.replace(/^mysql2:\/\//i, 'mysql://'));
    const connection = await createConnection({
      host: url.hostname,
      port: url.port === '' ? 3306 : Number(url.port),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    });
    try {
      await connection.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`);
    } finally {
      await connection.end();
    }
    return;
  }

  const { Client } = await import('pg');
  const client = new Client({ connectionString: baseUrl });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}

async function dropNamedDatabase(
  baseUrl: string,
  dialect: DatabaseDialect,
  name: string,
): Promise<void> {
  if (dialect === 'mysql') {
    const { createConnection } = await import('mysql2/promise');
    const url = new URL(baseUrl.replace(/^mysql2:\/\//i, 'mysql://'));
    const connection = await createConnection({
      host: url.hostname,
      port: url.port === '' ? 3306 : Number(url.port),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    });
    try {
      await connection.query(`DROP DATABASE IF EXISTS \`${name}\``);
    } finally {
      await connection.end();
    }
    return;
  }

  const { Client } = await import('pg');
  const client = new Client({ connectionString: baseUrl });
  await client.connect();
  try {
    await client.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [name],
    );
    await client.query(`DROP DATABASE IF EXISTS "${name}"`);
  } finally {
    await client.end();
  }
}

function withDatabaseName(baseUrl: string, name: string): string {
  const isMysql2 = /^mysql2:\/\//i.test(baseUrl);
  const url = new URL(baseUrl.replace(/^mysql2:\/\//i, 'mysql://'));
  url.pathname = `/${name}`;
  const rebuilt = url.toString();
  return isMysql2 ? rebuilt.replace(/^mysql:\/\//i, 'mysql2://') : rebuilt;
}
