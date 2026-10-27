import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { containsIgnoreCase } from '../src/common/helpers/search.js';
import { user } from '../src/db/schema/index.js';
import { createTestContext, type TestContext } from './helpers/db.js';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await createTestContext();
});

afterEach(async () => {
  await ctx.cleanup();
});

describe('containsIgnoreCase', () => {
  it('matches names and emails regardless of case', async () => {
    await ctx.db.insertReturning(user, {
      id: 'search-alice',
      email: 'Alice@Example.com',
      name: 'Alice',
    });
    await ctx.db.insertReturning(user, {
      id: 'search-bob',
      email: 'bob@example.com',
      name: 'Bob',
    });

    const byName = await ctx.db.db
      .select({ id: user.id })
      .from(user)
      .where(containsIgnoreCase(user.name, 'ALI'));
    const byEmail = await ctx.db.db
      .select({ id: user.id })
      .from(user)
      .where(containsIgnoreCase(user.email, 'example.COM'));

    expect(byName.map((row) => row.id)).toEqual(['search-alice']);
    expect(byEmail.map((row) => row.id).sort()).toEqual(['search-alice', 'search-bob']);
  });

  it('does not match unrelated rows', async () => {
    await ctx.db.insertReturning(user, {
      id: 'search-carol',
      email: 'carol@example.com',
      name: 'Carol',
    });

    const rows = await ctx.db.db
      .select({ id: user.id })
      .from(user)
      .where(containsIgnoreCase(user.name, 'zzz'));

    expect(rows).toHaveLength(0);
  });
});
