/**
 * Minimal idempotent seed: enough non-empty data to exercise data-copy and
 * smoke flows without a running server.
 *
 * Not a production bootstrap — it creates a placeholder superadmin that
 * CANNOT log in (no credential row); promote a real account with
 * `pnpm admin:grant` after registering through the website.
 *
 * Usage:
 *   DATABASE_URL=./data/mcserauth.db pnpm db:seed
 */
import 'dotenv/config';
import { AppConfigService } from '../src/config/app-config.service.js';
import { DbService } from '../src/db/db.service.js';
import {
  category as categoryTable,
  siteSetting as siteSettingTable,
  user as userTable,
} from '../src/db/schema/index.js';

const SEED_ADMIN_ID = 'seed-superadmin';

async function main(): Promise<void> {
  const config = new AppConfigService();
  const db = new DbService(config);
  try {
    await db.insertIgnore(userTable, {
      id: SEED_ADMIN_ID,
      email: 'seed-admin@localhost',
      name: 'Seed Admin',
      role: 'superadmin',
    });

    await db.insertIgnore(categoryTable, [
      { name: '综合讨论', slug: 'general', description: '自由讨论的默认版块', sortOrder: 0 },
      { name: '服务器展示', slug: 'servers', description: '宣传你的服务器', sortOrder: 1 },
    ]);

    await db.insertIgnore(siteSettingTable, [{ key: 'siteName', value: 'MCSerAuth 社区' }]);

    console.log(`Seed data ensured on ${db.dialect} database.`);
  } finally {
    await db.onModuleDestroy();
  }
}

main().catch((error: unknown) => {
  console.error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
