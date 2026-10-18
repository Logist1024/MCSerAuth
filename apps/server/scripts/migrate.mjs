/**
 * Applies drizzle-kit generated migrations to the SQLite database.
 *
 * Unlike `drizzle-kit migrate`, this creates the parent directory first, so a
 * fresh clone can run `pnpm db:migrate` before the server ever started. WAL is
 * enabled here as well to match the runtime connection (guide §5).
 */
import 'dotenv/config';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_URL ?? './data/mcserauth.db';
const databaseFile = path.resolve(process.cwd(), databaseUrl);
const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

fs.mkdirSync(path.dirname(databaseFile), { recursive: true });

const sqlite = new Database(databaseFile);
try {
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder });

  console.log(`Migrations applied to ${databaseFile}`);
} finally {
  sqlite.close();
}
