import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  user as userTable,
  player as playerTable,
  category as categoryTable,
} from '../src/db/schema/index.js';
import { tableByName } from '../src/db/schema/model.js';
import {
  copyDatabase,
  formatTimestamp,
  orderSelfReferencedRows,
  rowHash,
  sourceSelect,
  toTargetValues,
} from '../scripts/copy-data.js';
import { createTestContext, type TestContext } from './helpers/db.js';

describe('copy-data source query', () => {
  it('converts Drizzle SQLite timestamp seconds to milliseconds', () => {
    const user = tableByName('user');
    const columns = new Set(user.columns.map((column) => column.column));
    const select = sourceSelect(user, columns);

    expect(select).toContain('"created_at" * 1000 AS "created_at"');
    expect(select).toContain('"updated_at" * 1000 AS "updated_at"');
    expect(select).toContain('"muted_until" * 1000 AS "muted_until"');
    // Plain columns must not be touched.
    expect(select).toContain('"email"');
    expect(select).not.toContain('"email" * 1000');
  });

  it('derives active_slot for a source that predates the column', () => {
    const skin = tableByName('skin');
    const columns = new Set(
      skin.columns.map((column) => column.column).filter((column) => column !== 'active_slot'),
    );
    const select = sourceSelect(skin, columns);

    expect(select).toContain(
      `CASE WHEN "is_active" = 1 THEN "player_uuid" || ':' || "kind" ELSE NULL END AS "active_slot"`,
    );
  });

  it('fails when a required source column is missing', () => {
    const siteSetting = tableByName('site_setting');
    expect(() => sourceSelect(siteSetting, new Set(['key']))).toThrow(/missing column value/);
  });
});

describe('copy-data against a real SQLite database', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('reads a stored timestamp as epoch milliseconds', async () => {
    const createdAt = new Date('2026-10-20T14:08:48.000Z');
    await ctx.db.insertReturning(userTable, {
      id: 'copy-user',
      email: 'copy@example.com',
      name: 'copy-user',
      createdAt,
      updatedAt: createdAt,
    });

    const user = tableByName('user');
    const columns = new Set(user.columns.map((column) => column.column));
    const row = ctx.db.sqlite
      ?.prepare(`SELECT ${sourceSelect(user, columns)} FROM "user" WHERE id = ?`)
      .get('copy-user') as Record<string, unknown> | undefined;

    expect(row?.created_at).toBe(createdAt.getTime());
    expect(formatTimestamp(row?.created_at)).toBe('2026-10-20 14:08:48.000');
  });
});

describe('copy-data self-referencing rows', () => {
  const category = tableByName('category');

  it('inserts parents before their children', () => {
    const rows = [
      { id: 3, parent_id: 2, name: 'grandchild' },
      { id: 2, parent_id: 1, name: 'child' },
      { id: 1, parent_id: null, name: 'root' },
    ];

    expect(orderSelfReferencedRows(category, rows).map((row) => row.id)).toEqual([1, 2, 3]);
  });

  it('keeps rows with missing parents so the foreign key reports them', () => {
    const rows = [
      { id: 1, parent_id: null, name: 'root' },
      { id: 2, parent_id: 99, name: 'orphan' },
    ];

    expect(
      orderSelfReferencedRows(category, rows)
        .map((row) => row.id)
        .sort(),
    ).toEqual([1, 2]);
  });

  it('rejects a self-reference cycle', () => {
    const rows = [
      { id: 1, parent_id: 2, name: 'a' },
      { id: 2, parent_id: 1, name: 'b' },
    ];

    expect(() => orderSelfReferencedRows(category, rows)).toThrow(/cycle/);
  });
});

describe('copy-data timestamp formatting', () => {
  it('formats epoch milliseconds as a UTC wall-clock string', () => {
    expect(formatTimestamp(0)).toBe('1970-01-01 00:00:00.000');
    expect(formatTimestamp(1792505328000)).toBe('2026-10-20 14:08:48.000');
  });

  it('rejects invalid timestamp values', () => {
    expect(() => formatTimestamp('not-a-date')).toThrow(/Invalid timestamp/);
  });
});

describe('copy-data target values', () => {
  it('keeps timestamps and text in model column order', () => {
    const siteSetting = tableByName('site_setting');
    const values = toTargetValues(
      siteSetting,
      {
        key: 'siteName',
        value: 'MCSerAuth',
        updated_at: 1792505328000,
        updated_by: null,
      },
      'mysql',
    );

    expect(values).toEqual(['siteName', 'MCSerAuth', '2026-10-20 14:08:48.000', null]);
  });

  it('normalizes booleans for MySQL and PostgreSQL', () => {
    const player = tableByName('player');
    const row = {
      uuid: 'uuid-1',
      user_id: 'user-1',
      nickname: 'Steve',
      nickname_history: '[]',
      previous_nickname: null,
      name_cooldown_at: null,
      banned: 1,
      created_at: 1792505328000,
    };

    const mysql = toTargetValues(player, row, 'mysql');
    const postgres = toTargetValues(player, row, 'postgres');

    expect(mysql[6]).toBe(1);
    expect(postgres[6]).toBe(true);
    expect(mysql[7]).toBe('2026-10-20 14:08:48.000');
    expect(postgres[7]).toBe('2026-10-20 14:08:48.000');
  });

  it('stores epoch seconds for a SQLite target', () => {
    const player = tableByName('player');
    const row = {
      uuid: 'uuid-1',
      user_id: 'user-1',
      nickname: 'Steve',
      nickname_history: '["Steve","Alex"]',
      previous_nickname: null,
      name_cooldown_at: null,
      banned: 1,
      created_at: 1792505328000,
    };

    const values = toTargetValues(player, row, 'sqlite');

    expect(values[7]).toBe(1792505328);
    expect(values[6]).toBe(1);
  });
});

describe('copy-data checksums', () => {
  it('treats equivalent JSON and boolean representations as equal', () => {
    const player = tableByName('player');
    const source = {
      uuid: 'uuid-1',
      user_id: 'user-1',
      nickname: 'Steve',
      nickname_history: '["Steve","Alex"]',
      previous_nickname: null,
      name_cooldown_at: null,
      banned: 0,
      created_at: 1792505328000,
    };
    const target = {
      uuid: 'uuid-1',
      user_id: 'user-1',
      nickname: 'Steve',
      nickname_history: ['Steve', 'Alex'],
      previous_nickname: null,
      name_cooldown_at: null,
      banned: false,
      created_at: 1792505328000,
    };

    expect(rowHash(player, source)).toBe(rowHash(player, target));
  });

  it('is independent of JSON object key order', () => {
    const player = tableByName('player');
    const row = {
      uuid: 'uuid-1',
      user_id: 'user-1',
      nickname: 'Steve',
      nickname_history: '{"a":1,"b":2}',
      previous_nickname: null,
      name_cooldown_at: null,
      banned: 0,
      created_at: 0,
    };

    expect(rowHash(player, row)).toBe(
      rowHash(player, { ...row, nickname_history: '{"b":2,"a":1}' }),
    );
  });
});

describe('copy-data into a SQLite target', () => {
  let ctx: TestContext;
  let sourceFile: string;
  let targetFile: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    sourceFile = path.join(ctx.dir, 'test.db');
    targetFile = path.join(ctx.dir, 'target.db');

    // The target must be a separately migrated database, exactly like the
    // baseline-realignment flow documented in database.md.
    const { default: Database } = await import('better-sqlite3');
    const { drizzle } = await import('drizzle-orm/better-sqlite3');
    const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
    const sqlite = new Database(targetFile);
    try {
      migrate(drizzle(sqlite), {
        migrationsFolder: path.resolve(process.cwd(), 'drizzle', 'sqlite'),
      });
    } finally {
      sqlite.close();
    }

    const createdAt = new Date('2026-10-20T14:08:48.000Z');
    await ctx.db.insertReturning(userTable, {
      id: 'copy-target-user',
      email: 'copy-target@example.com',
      name: 'copy-target-user',
      mutedUntil: null,
      createdAt,
      updatedAt: createdAt,
    });
    await ctx.db.insertReturning(playerTable, {
      uuid: '11111111-1111-1111-1111-111111111111',
      userId: 'copy-target-user',
      nickname: 'Steve',
      nicknameHistory: ['Steve', 'Alex'],
      createdAt,
    });
    const rootRows = await ctx.db.insertReturning(categoryTable, {
      name: 'root',
      slug: 'root',
      sortOrder: 0,
    });
    await ctx.db.insertReturning(categoryTable, {
      name: 'child',
      slug: 'child',
      sortOrder: 1,
      parentId: rootRows[0]!.id,
    });
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('copies rows with checksums passing and timestamps in seconds', async () => {
    await copyDatabase({
      sourceUrl: sourceFile,
      targetUrl: targetFile,
      truncate: false,
      dryRun: false,
      batchSize: 200,
    });

    const { default: Database } = await import('better-sqlite3');
    const target = new Database(targetFile, { readonly: true });
    try {
      const user = target
        .prepare('SELECT created_at, muted_until FROM user WHERE id = ?')
        .get('copy-target-user') as { created_at: number; muted_until: number | null };
      const player = target
        .prepare('SELECT nickname_history, banned FROM player WHERE uuid = ?')
        .get('11111111-1111-1111-1111-111111111111') as {
        nickname_history: string;
        banned: number;
      };
      const categories = target
        .prepare('SELECT id, name, parent_id FROM category ORDER BY id')
        .all() as Array<{ id: number; name: string; parent_id: number | null }>;

      expect(user.created_at).toBe(1792505328);
      expect(user.muted_until).toBeNull();
      expect(player.nickname_history).toBe('["Steve","Alex"]');
      expect(player.banned).toBe(0);
      expect(categories).toHaveLength(2);
      expect(categories[0]).toMatchObject({ name: 'root', parent_id: null });
      expect(categories[1]?.name).toBe('child');
      expect(categories[1]?.parent_id).toBe(categories[0]?.id);
    } finally {
      target.close();
    }
  });

  it('refuses a non-empty target without --truncate and replaces it with one', async () => {
    await expect(
      copyDatabase({
        sourceUrl: sourceFile,
        targetUrl: targetFile,
        truncate: false,
        dryRun: false,
        batchSize: 200,
      }),
    ).rejects.toThrow(/Target is not empty/);

    await copyDatabase({
      sourceUrl: sourceFile,
      targetUrl: targetFile,
      truncate: true,
      dryRun: false,
      batchSize: 200,
    });

    const { default: Database } = await import('better-sqlite3');
    const target = new Database(targetFile, { readonly: true });
    try {
      const count = target.prepare('SELECT COUNT(*) AS n FROM user').get() as { n: number };
      expect(count.n).toBe(1);
    } finally {
      target.close();
    }
  });

  it('rejects copying a database onto itself', async () => {
    await expect(
      copyDatabase({
        sourceUrl: sourceFile,
        targetUrl: sourceFile,
        truncate: false,
        dryRun: false,
        batchSize: 200,
      }),
    ).rejects.toThrow(/must be different files/);
  });
});
