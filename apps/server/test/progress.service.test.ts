import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { GROWTH_RULES, LEVEL_MAX, XP_PER_LEVEL } from '@mcserauth/shared';
import { and, eq } from 'drizzle-orm';
import { firstOrThrow } from '../src/common/helpers/rows.js';
import { ProgressService } from '../src/modules/growth/progress.service.js';
import {
  category,
  post,
  reply,
  siteSetting,
  title as titleTable,
  user,
} from '../src/db/schema/index.js';
import { createTestContext, type TestContext } from './helpers/db.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
const DAY_MS = 24 * 60 * 60 * 1000;
describe('ProgressService', () => {
  let ctx: TestContext;
  let progress: ProgressService;
  async function makeService(): Promise<ProgressService> {
    const service = new ProgressService(ctx.db);
    await service.onModuleInit();
    return service;
  }
  beforeEach(async () => {
    ctx = await createTestContext();
    await ctx.db.db.insert(user).values([
      { id: 'u1', email: 'u1@example.com', name: 'User One' },
      { id: 'u2', email: 'u2@example.com', name: 'User Two' },
      { id: 'u3', email: 'u3@example.com', name: 'User Three' },
    ]);
    progress = await makeService();
  });
  afterEach(async () => {
    await ctx.cleanup();
  });
  describe('configurable rules', () => {
    it('falls back to the shipped defaults', async () => {
      expect((await progress.rules()).checkinBaseXp).toBe(GROWTH_RULES.checkinBaseXp);
      expect((await progress.rulesView()).customized).toBe(false);
    });
    it('merges a partial override and keeps other keys at their default', async () => {
      const view = await progress.updateRules('u1', { checkinBaseXp: 50, replyXp: 0 });
      expect(view.rules.checkinBaseXp).toBe(50);
      expect(view.rules.replyXp).toBe(0);
      expect(view.rules.bannerPrice).toBe(GROWTH_RULES.bannerPrice);
      expect(view.customized).toBe(true);
    });
    it('re-reads the stored override from a fresh service instance', async () => {
      await progress.updateRules('u1', { checkinBaseXp: 33 });
      expect((await (await makeService()).rules()).checkinBaseXp).toBe(33);
    });
    it('rejects out-of-bounds values instead of persisting them', async () => {
      await expect(progress.updateRules('u1', { titleApplicationLevel: 999 })).rejects.toThrow();
      expect((await progress.rules()).titleApplicationLevel).toBe(
        GROWTH_RULES.titleApplicationLevel,
      );
    });
    it('restores defaults on reset', async () => {
      await progress.updateRules('u1', { checkinBaseXp: 50 });
      const view = await progress.resetRules('u1');
      expect(view.rules.checkinBaseXp).toBe(GROWTH_RULES.checkinBaseXp);
      expect(view.customized).toBe(false);
    });
    it('falls back to defaults when the stored override is unreadable', async () => {
      await ctx.db.db
        .insert(siteSetting)
        .values({ key: 'growthRules', value: 'not-json', updatedAt: new Date() });
      expect(await (await makeService()).rules()).toEqual({ ...GROWTH_RULES });
      await ctx.db.db
        .update(siteSetting)
        .set({ value: JSON.stringify({ checkinBaseXp: -1 }) })
        .where(eq(siteSetting.key, 'growthRules'));
      expect((await (await makeService()).rules()).checkinBaseXp).toBe(GROWTH_RULES.checkinBaseXp);
    });
    it('prices and labels the shop from the effective rules', async () => {
      await progress.updateRules('u1', { xpBoostPrice: 777, xpBoostHours: 48 });
      const boost = (await progress.shopItems()).find((item) => item.key === 'xp_boost');
      expect(boost?.price).toBe(777);
      expect(boost?.description).toContain('48');
    });
  });
  describe('check-in', () => {
    it('awards the configured XP and points', async () => {
      const result = await progress.checkin('u1');
      expect(result.xpAwarded).toBe(GROWTH_RULES.checkinBaseXp);
      expect(result.pointsAwarded).toBe(GROWTH_RULES.checkinBasePoints);
      expect(result.streak).toBe(1);
    });
    it('follows a retuned rule value', async () => {
      await progress.updateRules('u2', { checkinBaseXp: 40, checkinBasePoints: 5 });
      expect((await progress.checkin('u1')).xpAwarded).toBe(40);
    });
    it('refuses a second check-in on the same day', async () => {
      await progress.checkin('u1');
      await expect(progress.checkin('u1')).rejects.toThrow(ConflictException);
    });
    it('grows the streak bonus and caps it', async () => {
      const first = new Date('2026-01-01T12:00:00+08:00');
      await progress.checkin('u1', first);
      const second = await progress.checkin('u1', new Date(first.getTime() + DAY_MS));
      expect(second.streak).toBe(2);
      expect(second.xpAwarded).toBe(GROWTH_RULES.checkinBaseXp + GROWTH_RULES.checkinStreakXp);
      // Walk past the bonus cap so the capped term is provably applied.
      let day = new Date(first.getTime() + DAY_MS);
      for (let i = 0; i < GROWTH_RULES.checkinStreakXpCap + 3; i += 1) {
        day = new Date(day.getTime() + DAY_MS);
        await progress.checkin('u2', day);
      }
      const capped = await progress.checkin('u2', new Date(day.getTime() + DAY_MS));
      expect(capped.xpAwarded).toBe(
        GROWTH_RULES.checkinBaseXp + GROWTH_RULES.checkinStreakXpCap * GROWTH_RULES.checkinStreakXp,
      );
    });
    it('multiplies check-in XP while a boost card is active', async () => {
      await progress.ensure('u1');
      // Give the account enough points, then buy the boost.
      await progress.adjustPoints('u2', 'u1', GROWTH_RULES.xpBoostPrice + 10, 'top up');
      await progress.purchase('u1', { item: 'xp_boost' });
      const boosted = await progress.checkin('u1', new Date(Date.now() + 60 * 60 * 1000));
      expect(boosted.xpAwarded).toBe(GROWTH_RULES.checkinBaseXp * GROWTH_RULES.xpBoostMultiplier);
    });
  });
  describe('special titles opt out of the level system', () => {
    async function sponsorTitleId(): Promise<number> {
      const row = (
        await ctx.db.db
          .select({ id: titleTable.id })
          .from(titleTable)
          .where(eq(titleTable.name, '赞助商'))
      )[0];
      if (!row) {
        throw new Error('seeded sponsor title missing');
      }
      return row.id;
    }
    it('grants the exemption flag and stops XP accrual', async () => {
      const before = await progress.summary('u1');
      expect(before.levelExempt).toBe(false);
      await progress.grantTitle('u2', await sponsorTitleId(), 'u1');
      expect(await progress.hasSpecialTitle('u1')).toBe(true);
      expect((await progress.summary('u1')).levelExempt).toBe(true);
      expect(await progress.awardXp('u1', 100)).toBe(0);
      expect((await progress.summary('u1')).xp).toBe(before.xp);
    });
    it('still credits points for the daily check-in but no XP', async () => {
      await progress.grantTitle('u2', await sponsorTitleId(), 'u1');
      const result = await progress.checkin('u1');
      expect(result.xpAwarded).toBe(0);
      expect(result.pointsAwarded).toBe(GROWTH_RULES.checkinBasePoints);
    });
    it('leaves the holder off the leaderboard and restores them after revoke', async () => {
      await progress.awardXp('u1', 500);
      await progress.awardXp('u3', 100);
      expect((await progress.leaderboard(10)).map((row) => row.userId)).toEqual(['u1', 'u3']);
      await progress.grantTitle('u2', await sponsorTitleId(), 'u1');
      expect((await progress.leaderboard(10)).map((row) => row.userId)).toEqual(['u3']);
      await progress.revokeTitle('u2', await sponsorTitleId(), 'u1');
      expect((await progress.leaderboard(10)).map((row) => row.userId)).toEqual(['u1', 'u3']);
    });
    it('keeps custom titles inside the ladder', async () => {
      const created = firstOrThrow(
        await ctx.db.insertReturning(titleTable, { name: '传说专属', kind: 'custom' }),
      );
      await progress.awardXp('u1', 300);
      await progress.grantTitle('u2', created.id, 'u1');
      expect(await progress.hasSpecialTitle('u1')).toBe(false);
      expect((await progress.summary('u1')).levelExempt).toBe(false);
      expect(await progress.awardXp('u1', 10)).toBe(10);
      expect((await progress.leaderboard(10)).map((row) => row.userId)).toContain('u1');
    });
    it('refuses a duplicate grant', async () => {
      const id = await sponsorTitleId();
      await progress.grantTitle('u2', id, 'u1');
      await expect(progress.grantTitle('u2', id, 'u1')).rejects.toThrow(ConflictException);
    });
    it('hides the level badge for title holders in batch lookups', async () => {
      await progress.awardXp('u1', 250);
      await progress.awardXp('u2', 250);
      await progress.grantTitle('u2', await sponsorTitleId(), 'u1');
      const badges = await progress.badgesFor(['u1', 'u2']);
      expect(badges.get('u1')?.level).toBeNull();
      expect(badges.get('u1')?.title?.name).toBe('赞助商');
      expect(badges.get('u2')?.level).toBe(3);
      expect(badges.get('u2')?.title).toBeNull();
    });
  });
  describe('points ledger and shop', () => {
    it('blocks a purchase the wallet cannot cover', async () => {
      await progress.ensure('u1');
      await expect(progress.purchase('u1', { item: 'cape_unlock' })).rejects.toThrow(
        BadRequestException,
      );
    });
    it('unlocks the cape once and rejects a repeat', async () => {
      await progress.adjustPoints('u2', 'u1', GROWTH_RULES.capeUnlockPrice * 2 + 100, 'grant');
      expect(await progress.capeUnlocked('u1')).toBe(false);
      await progress.purchase('u1', { item: 'cape_unlock' });
      expect(await progress.capeUnlocked('u1')).toBe(true);
      await expect(progress.purchase('u1', { item: 'cape_unlock' })).rejects.toThrow(
        ConflictException,
      );
    });
    it('assertCapeUnlocked explains the price while locked', async () => {
      await progress.ensure('u3');
      await expect(progress.assertCapeUnlocked('u3')).rejects.toThrow(ForbiddenException);
      await expect(progress.assertCapeUnlocked('u3')).rejects.toThrow(
        `披风功能尚未解锁，请在成长中心使用 ${GROWTH_RULES.capeUnlockPrice} 积分解锁`,
      );
      await progress.adjustPoints('u2', 'u3', GROWTH_RULES.capeUnlockPrice, 'grant');
      await progress.purchase('u3', { item: 'cape_unlock' });
      await expect(progress.assertCapeUnlocked('u3')).resolves.toBeUndefined();
    });
    it('records a balance-after row for every mutation', async () => {
      const granted = await progress.adjustPoints('u2', 'u1', 200, 'grant');
      expect(granted.points).toBe(200);
      const page = await progress.listTransactions('u1');
      expect(page.items[0]?.balanceAfter).toBe(200);
      expect(page.items[0]?.amount).toBe(200);
    });
    it('rejects tips outside the configured range and self-tips', async () => {
      await progress.adjustPoints('u2', 'u1', 1000, 'grant');
      await expect(progress.tip('u1', { userId: 'u3', amount: 0 })).rejects.toThrow(
        BadRequestException,
      );
      await expect(progress.tip('u1', { userId: 'u1', amount: 5 })).rejects.toThrow(
        BadRequestException,
      );
      const result = await progress.tip('u1', { userId: 'u3', amount: 300 });
      expect(result.progress.points).toBe(700);
      expect(result.recipient.points).toBe(300);
    });
    it('stacks boost purchases instead of resetting them', async () => {
      await progress.adjustPoints('u2', 'u1', GROWTH_RULES.xpBoostPrice * 2 + 20, 'grant');
      await progress.purchase('u1', { item: 'xp_boost' });
      const first = (await progress.summary('u1')).xpBoostUntil;
      await progress.purchase('u1', { item: 'xp_boost' });
      const second = (await progress.summary('u1')).xpBoostUntil;
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(new Date(second as string).getTime()).toBeGreaterThan(
        new Date(first as string).getTime(),
      );
    });
  });
  describe('level curve', () => {
    it('caps XP at level 100', async () => {
      await progress.awardXp('u1', LEVEL_MAX * XP_PER_LEVEL + 5000);
      const summary = await progress.summary('u1');
      expect(summary.level).toBe(LEVEL_MAX);
      expect(summary.isMaxLevel).toBe(true);
      expect(summary.xpForNextLevel).toBeNull();
      expect(summary.progressPercent).toBe(100);
    });
    it('requires level 100 before a custom title can be applied for', async () => {
      await expect(
        progress.submitTitleApplication('u1', {
          proposedName: '新手专属',
          reason: '想要一个称号',
        }),
      ).rejects.toThrow();
      await progress.awardXp('u1', (LEVEL_MAX - 1) * XP_PER_LEVEL);
      const applied = await progress.submitTitleApplication('u1', {
        proposedName: '传说专属',
        reason: '长期贡献社区内容',
      });
      expect(applied.status).toBe('pending');
    });
  });
  describe('post and reply XP', () => {
    it('stops awarding once the daily cap is passed', async () => {
      const now = new Date('2026-03-01T09:00:00+08:00');
      const board = firstOrThrow(
        await ctx.db.insertReturning(category, { name: 'General', slug: 'general' }),
      );
      for (let i = 0; i < GROWTH_RULES.postDailyXpLimit; i += 1) {
        await ctx.db.db.insert(post).values({
          categoryId: board.id,
          authorId: 'u1',
          title: `Post ${i}`,
          contentMd: 'body',
          createdAt: now,
          lastActivityAt: now,
        });
      }
      // The cap counts posts already published today, so the last one inside
      // the window still earns and the next one does not.
      expect(await progress.awardPostXp('u1', now)).toBe(GROWTH_RULES.postXp);
      await ctx.db.db.insert(post).values({
        categoryId: board.id,
        authorId: 'u1',
        title: 'One too many',
        contentMd: 'body',
        createdAt: now,
        lastActivityAt: now,
      });
      expect(await progress.awardPostXp('u1', now)).toBe(0);
    });
    it('applies the reply cap independently of posts', async () => {
      const now = new Date('2026-03-01T09:00:00+08:00');
      const board = firstOrThrow(
        await ctx.db.insertReturning(category, { name: 'Replying', slug: 'replying' }),
      );
      const postId = firstOrThrow(
        await ctx.db.insertReturning(post, {
          categoryId: board.id,
          authorId: 'u2',
          title: 'Thread',
          contentMd: 'body',
          createdAt: now,
          lastActivityAt: now,
        }),
      ).id;
      for (let i = 0; i <= GROWTH_RULES.replyDailyXpLimit; i += 1) {
        await ctx.db.db.insert(reply).values({
          postId,
          authorId: 'u1',
          contentMd: `reply ${i}`,
          floor: i + 1,
          createdAt: now,
        });
      }
      expect(await progress.awardReplyXp('u1', now)).toBe(0);
    });
    it('ignores draft and hidden posts when counting the daily cap', async () => {
      const now = new Date('2026-03-01T09:00:00+08:00');
      const board = firstOrThrow(
        await ctx.db.insertReturning(category, { name: 'Hidden', slug: 'hidden-board' }),
      );
      for (let i = 0; i < GROWTH_RULES.postDailyXpLimit + 2; i += 1) {
        await ctx.db.db.insert(post).values({
          categoryId: board.id,
          authorId: 'u1',
          title: `Hidden ${i}`,
          contentMd: 'body',
          status: 'hidden',
          createdAt: now,
          lastActivityAt: now,
        });
      }
      expect(await progress.awardPostXp('u1', now)).toBe(GROWTH_RULES.postXp);
    });
  });
  describe('capability-free read paths', () => {
    it('exposes the effective rules through the overview payload', async () => {
      await progress.updateRules('u2', { capeUnlockPrice: 1234 });
      const overview = await progress.overview('u1');
      expect(overview.rules.capeUnlockPrice).toBe(1234);
      expect(overview.shop.find((item) => item.key === 'cape_unlock')?.price).toBe(1234);
      expect(overview.progress.levelExempt).toBe(false);
    });
  });
  it('keeps the seeded special titles idempotent across restarts', async () => {
    await makeService();
    await makeService();
    const rows = await ctx.db.db
      .select({ id: titleTable.id })
      .from(titleTable)
      .where(and(eq(titleTable.kind, 'special')));
    expect(rows).toHaveLength(3);
  });
});
