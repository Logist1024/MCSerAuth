import type Database from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppConfigService } from '../../src/config/app-config.service.js';
import type * as schema from '../../src/db/schema/index.js';
import { DbService } from '../../src/db/db.service.js';

export interface TestContext {
  db: DbService;
  sqlite: Database.Database;
  drizzle: BetterSQLite3Database<typeof schema>;
  config: AppConfigService;
  dir: string;
  cleanup: () => void;
}

/** Temp-file SQLite with all migrations applied and isolated env values. */
export function createTestContext(): TestContext {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcserauth-test-'));
  const file = path.join(dir, 'test.db');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = file;
  process.env.UPLOAD_DIR = path.join(dir, 'uploads');
  process.env.BETTER_AUTH_SECRET = 'test-secret-0123456789-0123456789-0123456789';
  process.env.APP_URL = 'http://localhost:3000';
  process.env.AUTH_URL = 'http://localhost:8000';
  process.env.COOKIE_SECURE = 'false';

  const config = new AppConfigService();
  const db = new DbService(config);
  migrate(db.db, { migrationsFolder: path.resolve(process.cwd(), 'drizzle') });

  return {
    db,
    sqlite: db.sqlite,
    drizzle: db.db,
    config,
    dir,
    cleanup: () => {
      db.onModuleDestroy();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
