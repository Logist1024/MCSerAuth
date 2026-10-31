import { and, eq, isNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { player, siteSetting, title, uploadUsage, user } from '../src/db/schema/index.js';
import { createTestContext, type TestContext } from './helpers/db.js';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await createTestContext();
});

afterEach(async () => {
  await ctx.cleanup();
});

describe('DbService cross-dialect helpers', () => {
  it('insertReturning returns the inserted row', async () => {
    const [row] = await ctx.db.insertReturning(title, {
      name: 'helper-insert',
      kind: 'special',
      color: '#123456',
    });

    expect(row).toBeDefined();
    expect(row?.id).toBeTypeOf('number');
    expect(row?.name).toBe('helper-insert');
    expect(row?.color).toBe('#123456');
  });

  it('updateReturning returns the updated rows', async () => {
    const [row] = await ctx.db.insertReturning(title, {
      name: 'helper-update',
      kind: 'special',
      color: '#123456',
    });

    const [updated] = await ctx.db.updateReturning(
      title,
      { description: 'updated through helper' },
      eq(title.id, row!.id),
    );

    expect(updated?.id).toBe(row?.id);
    expect(updated?.description).toBe('updated through helper');
  });

  it('updateReturning returns no rows when the condition no longer matches', async () => {
    const [row] = await ctx.db.insertReturning(title, {
      name: 'helper-claim',
      kind: 'special',
      color: '#123456',
    });

    const first = await ctx.db.updateReturning(
      title,
      { description: 'claimed once' },
      and(eq(title.id, row!.id), isNull(title.description)),
    );
    expect(first).toHaveLength(1);

    // Compare-and-swap: the second claim must not return the row again.
    const second = await ctx.db.updateReturning(
      title,
      { description: 'claimed twice' },
      and(eq(title.id, row!.id), isNull(title.description)),
    );
    expect(second).toHaveLength(0);
  });

  it('updateReturning returns no rows for a missing row', async () => {
    const rows = await ctx.db.updateReturning(
      title,
      { description: 'nothing' },
      eq(title.id, 999999),
    );
    expect(rows).toHaveLength(0);
  });

  it('insertIgnore keeps the first row on conflict', async () => {
    await ctx.db.insertIgnore(siteSetting, { key: 'helper-key', value: 'first' });
    await ctx.db.insertIgnore(siteSetting, { key: 'helper-key', value: 'second' });

    const rows = await ctx.db.db
      .select()
      .from(siteSetting)
      .where(eq(siteSetting.key, 'helper-key'));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe('first');
  });

  it('insertIgnore resolves composite primary keys on upload_usage', async () => {
    await ctx.db.db.insert(user).values({
      id: 'helper-u1',
      email: 'helper-u1@example.com',
      name: 'Helper U1',
    });
    await ctx.db.insertIgnore(uploadUsage, {
      userId: 'helper-u1',
      kind: 'skin',
      day: '2030-01-01',
      count: 0,
    });
    await ctx.db.insertIgnore(uploadUsage, {
      userId: 'helper-u1',
      kind: 'skin',
      day: '2030-01-01',
      count: 5,
    });

    const rows = await ctx.db.db
      .select()
      .from(uploadUsage)
      .where(eq(uploadUsage.userId, 'helper-u1'));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(0);
  });

  it('upsert inserts and then updates the same row', async () => {
    await ctx.db.upsert(
      siteSetting,
      { key: 'helper-upsert', value: 'first' },
      { target: siteSetting.key, set: { value: 'second' } },
    );
    await ctx.db.upsert(
      siteSetting,
      { key: 'helper-upsert', value: 'third' },
      { target: siteSetting.key, set: { value: 'fourth' } },
    );

    const rows = await ctx.db.db
      .select()
      .from(siteSetting)
      .where(eq(siteSetting.key, 'helper-upsert'));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe('fourth');
  });

  it('affectedRows normalizes driver results', async () => {
    const [row] = await ctx.db.insertReturning(title, {
      name: 'helper-affected',
      kind: 'special',
      color: '#123456',
    });

    const result = await ctx.db.db
      .update(title)
      .set({ description: 'changed' })
      .where(eq(title.id, row!.id));

    expect(ctx.db.affectedRows(result)).toBe(1);
    expect(ctx.db.affectedRows({ changes: 2 })).toBe(2);
    expect(ctx.db.affectedRows([{ affectedRows: 3 }])).toBe(3);
    expect(ctx.db.affectedRows({ rowCount: 4 })).toBe(4);
  });

  it('commits a successful transaction', async () => {
    await ctx.db.transaction(async (tx) => {
      await ctx.db.insertReturning(
        title,
        { name: 'helper-commit', kind: 'special', color: '#123456' },
        tx,
      );
    });

    const rows = await ctx.db.db.select().from(title).where(eq(title.name, 'helper-commit'));
    expect(rows).toHaveLength(1);
  });

  it('rolls back a failed transaction', async () => {
    await expect(
      ctx.db.transaction(async (tx) => {
        await ctx.db.insertReturning(
          title,
          { name: 'helper-rollback', kind: 'special', color: '#123456' },
          tx,
        );
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const rows = await ctx.db.db.select().from(title).where(eq(title.name, 'helper-rollback'));
    expect(rows).toHaveLength(0);
  });

  it('serializes concurrent top-level transactions', async () => {
    await Promise.all([
      ctx.db.transaction(async (tx) => {
        await ctx.db.insertReturning(
          title,
          { name: 'helper-concurrent-a', kind: 'special', color: '#123456' },
          tx,
        );
        await new Promise((resolve) => setTimeout(resolve, 20));
        await ctx.db.insertReturning(
          title,
          { name: 'helper-concurrent-b', kind: 'special', color: '#123456' },
          tx,
        );
      }),
      ctx.db.transaction(async (tx) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await ctx.db.insertReturning(
          title,
          { name: 'helper-concurrent-c', kind: 'special', color: '#123456' },
          tx,
        );
      }),
    ]);

    const rows = await ctx.db.db.select().from(title);
    expect(rows.map((row) => row.name).sort()).toEqual([
      'helper-concurrent-a',
      'helper-concurrent-b',
      'helper-concurrent-c',
    ]);
  });

  it('reuses the active transaction for nested calls', async () => {
    await ctx.db.transaction(async (tx) => {
      await ctx.db.transaction(async (inner) => {
        expect(inner).toBe(tx);
        await ctx.db.insertReturning(
          title,
          { name: 'helper-nested', kind: 'special', color: '#123456' },
          inner,
        );
      });
    });

    const rows = await ctx.db.db.select().from(title).where(eq(title.name, 'helper-nested'));
    expect(rows).toHaveLength(1);
  });

  it('enforces the foreign keys restored by the migrations', async () => {
    await expect(
      ctx.db.insertReturning(player, {
        uuid: 'fk-orphan-player',
        userId: 'missing-user',
        nickname: 'fk-orphan-player',
      }),
    ).rejects.toThrow();
  });

  it('cascades user deletes to owned players', async () => {
    await ctx.db.insertReturning(user, {
      id: 'fk-owner',
      email: 'fk-owner@example.com',
      name: 'fk-owner',
    });
    await ctx.db.insertReturning(player, {
      uuid: 'fk-owned-player',
      userId: 'fk-owner',
      nickname: 'fk-owned-player',
    });

    await ctx.db.db.delete(user).where(eq(user.id, 'fk-owner'));

    const rows = await ctx.db.db.select().from(player).where(eq(player.uuid, 'fk-owned-player'));
    expect(rows).toHaveLength(0);
  });
});
