/**
 * Applies drizzle-kit generated migrations for the configured database.
 *
 * The dialect is derived from `DATABASE_URL` (an optional `DB_DIALECT`
 * override must agree with it), so the same command works for SQLite, MySQL
 * and PostgreSQL:
 *
 *   DATABASE_URL=./data/mcserauth.db        pnpm db:migrate
 *   DATABASE_URL=mysql://user:pass@host/db  pnpm db:migrate
 *   DATABASE_URL=postgres://user:pass@host/db pnpm db:migrate
 *
 * Unlike `drizzle-kit migrate`, the SQLite branch creates the parent directory
 * first, so a fresh clone can run `pnpm db:migrate` before the server ever
 * started. WAL is enabled here as well to match the runtime connection.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const rawUrl = process.env.DATABASE_URL ?? './data/mcserauth.db';
const dialect = detectDialect(rawUrl, process.env.DB_DIALECT);
const migrationsFolder = path.resolve(
  process.cwd(),
  'drizzle',
  dialect === 'postgres' ? 'postgres' : dialect,
);

if (dialect === 'sqlite') {
  await migrateSqlite(rawUrl);
} else if (dialect === 'mysql') {
  await migrateMysql(rawUrl);
} else {
  await migratePostgres(rawUrl);
}

async function migrateSqlite(databaseUrl) {
  const { default: Database } = await import('better-sqlite3');
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');

  const databaseFile = sqliteFile(databaseUrl);
  fs.mkdirSync(path.dirname(databaseFile), { recursive: true });

  const sqlite = new Database(databaseFile);
  try {
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    migrate(drizzle(sqlite), { migrationsFolder });

    // Legacy role rename: `mod` became `reviewer` in the four-tier permission model.
    const renamedRoles = sqlite
      .prepare("update user set role = 'reviewer' where role = 'mod'")
      .run();
    if (renamedRoles.changes > 0) {
      console.log(`Renamed ${renamedRoles.changes} legacy mod role(s) to reviewer`);
    }

    // Textures are no longer pre-moderated; historical pending rows become usable.
    const approvedTextures = sqlite
      .prepare("update skin set status = 'approved' where status = 'pending'")
      .run();
    if (approvedTextures.changes > 0) {
      console.log(`Marked ${approvedTextures.changes} pending texture(s) as approved`);
    }

    // Backfill the MySQL-compatible active-slot discriminator (idempotent).
    const slots = sqlite
      .prepare(
        "update skin set active_slot = player_uuid || ':' || kind " +
          'where is_active = 1 and active_slot is null',
      )
      .run();
    if (slots.changes > 0) {
      console.log(`Backfilled ${slots.changes} active texture slot(s)`);
    }

    console.log(`SQLite migrations applied to ${databaseFile}`);
  } finally {
    sqlite.close();
  }
}

async function migrateMysql(databaseUrl) {
  const { createPool } = await import('mysql2/promise');
  const { drizzle } = await import('drizzle-orm/mysql2');
  const { migrate } = await import('drizzle-orm/mysql2/migrator');

  const pool = createPool({ uri: databaseUrl, connectionLimit: 1, timezone: 'Z' });
  try {
    await migrate(drizzle(pool, { mode: 'default' }), { migrationsFolder });
    console.log(`MySQL migrations applied to ${redact(databaseUrl)}`);
  } finally {
    await pool.end();
  }
}

async function migratePostgres(databaseUrl) {
  const { Pool } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
    console.log(`PostgreSQL migrations applied to ${redact(databaseUrl)}`);
  } finally {
    await pool.end();
  }
}

function detectDialect(databaseUrl, override) {
  const fromUrl = /^mysql2?:\/\//i.test(databaseUrl)
    ? 'mysql'
    : /^postgres(?:ql)?:\/\//i.test(databaseUrl)
      ? 'postgres'
      : 'sqlite';
  const explicit = override?.trim().toLowerCase();
  if (explicit === undefined || explicit === '') {
    return fromUrl;
  }
  const normalized = explicit === 'postgresql' ? 'postgres' : explicit;
  if (normalized !== fromUrl) {
    throw new Error(`DB_DIALECT=${override} does not match DATABASE_URL (detected ${fromUrl}).`);
  }
  return normalized;
}

function sqliteFile(databaseUrl) {
  const stripped = databaseUrl.replace(/^sqlite:(?:\/\/)?/i, '').replace(/^file:/i, '');
  return path.resolve(process.cwd(), stripped);
}

function redact(databaseUrl) {
  try {
    const url = new URL(databaseUrl.replace(/^mysql2:\/\//i, 'mysql://'));
    if (url.password !== '') {
      url.password = '***';
    }
    return url.toString();
  } catch {
    return '<unparseable database url>';
  }
}
