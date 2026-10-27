/**
 * Applies drizzle-kit generated migrations to the SQLite database.
 *
 * Unlike `drizzle-kit migrate`, this creates the parent directory first, so a
 * fresh clone can run `pnpm db:migrate` before the server ever started. WAL is
 * enabled here as well to match the runtime connection.
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

  // Legacy role rename: `mod` became `reviewer` in the four-tier permission model.
  const renamedRoles = sqlite.prepare("update user set role = 'reviewer' where role = 'mod'").run();
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

  console.log(`Migrations applied to ${databaseFile}`);
} finally {
  sqlite.close();
}
