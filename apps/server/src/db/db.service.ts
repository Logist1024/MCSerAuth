import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { AppConfigService } from '../config/app-config.service.js';
import * as schema from './schema/index.js';

/**
 * Single SQLite connection for the whole process.
 *
 * WAL is enabled explicitly on the connection (guide §5), foreign keys are
 * enforced, and a busy timeout avoids immediate SQLITE_BUSY under short
 * concurrent writes. Schema changes only ever happen through drizzle-kit
 * migrations — never at runtime.
 */
@Injectable()
export class DbService implements OnModuleDestroy {
  readonly sqlite: Database.Database;
  readonly db: BetterSQLite3Database<typeof schema>;

  constructor(config: AppConfigService) {
    const file = path.resolve(process.cwd(), config.databaseUrl);
    fs.mkdirSync(path.dirname(file), { recursive: true });

    this.sqlite = new Database(file);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');
    this.sqlite.pragma('busy_timeout = 5000');

    this.db = drizzle(this.sqlite, { schema });
  }

  /** Cheap readiness probe used by GET /health. */
  ping(): boolean {
    try {
      this.sqlite.prepare('select 1 as ok').get();
      return true;
    } catch {
      return false;
    }
  }

  onModuleDestroy(): void {
    if (this.sqlite.open) {
      this.sqlite.close();
    }
  }
}
