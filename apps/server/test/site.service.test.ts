import { BadRequestException } from '@nestjs/common';
import { HOME_CONTENT_LIMITS, type HomeContent } from '@mcserauth/shared';
import { eq } from 'drizzle-orm';
import { NotificationsService } from '../src/modules/forum/notifications.service.js';
import { ProgressService } from '../src/modules/growth/progress.service.js';
import { SiteService } from '../src/modules/site/site.service.js';
import { banner, siteSetting, user } from '../src/db/schema/index.js';
import { createTestContext, type TestContext } from './helpers/db.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
function content(overrides: Partial<HomeContent> = {}): HomeContent {
  return {
    heroEyebrow: '外置登录',
    heroTitle: '欢迎来到社区',
    heroText: '一句话介绍',
    primaryAction: { label: '进入论坛', href: '/forum' },
    secondaryAction: { label: '连接启动器', href: '/textures' },
    stats: [{ label: '在线玩家', value: '128' }],
    steps: ['注册账号', '上传皮肤', '启动游戏'],
    entries: [
      {
        title: '服务器介绍',
        description: '了解更多',
        href: 'https://example.com',
        actionLabel: '查看',
      },
    ],
    ...overrides,
  };
}
describe('SiteService home content', () => {
  let ctx: TestContext;
  let site: SiteService;
  beforeEach(async () => {
    ctx = await createTestContext();
    await ctx.db.db
      .insert(user)
      .values({ id: 'actor', email: 'actor@example.com', name: 'Actor', role: 'superadmin' });
    site = new SiteService(
      ctx.db,
      ctx.config,
      new NotificationsService(ctx.db),
      new ProgressService(ctx.db),
    );
  });
  afterEach(async () => {
    await ctx.cleanup();
  });
  it('serves built-in defaults on a fresh deployment', async () => {
    const home = await site.getHome();
    expect(home.content.heroTitle.length).toBeGreaterThan(0);
    expect(home.content.steps.length).toBeGreaterThan(0);
    expect(home.banners).toEqual([]);
  });
  it('persists and reads back edited content', async () => {
    await site.updateSettings({ homeContent: content({ heroTitle: '新首页标题' }) }, 'actor');
    expect((await site.getHomeContent()).heroTitle).toBe('新首页标题');
    expect((await site.getHome()).content.entries[0]?.href).toBe('https://example.com');
  });
  it('keeps every managed block, not just the hero', async () => {
    const input = content({
      stats: Array.from({ length: HOME_CONTENT_LIMITS.stats }, (_, i) => ({
        label: `指标${i}`,
        value: `${i}`,
      })),
    });
    await site.updateSettings({ homeContent: input }, 'actor');
    const stored = await site.getHomeContent();
    expect(stored.stats).toHaveLength(HOME_CONTENT_LIMITS.stats);
    expect(stored.steps).toHaveLength(3);
    expect(stored.entries).toHaveLength(1);
    expect(stored.primaryAction).toEqual({ label: '进入论坛', href: '/forum' });
  });
  it('accepts deliberately emptied blocks so the page can hide a section', async () => {
    await site.updateSettings({ homeContent: content({ steps: [], entries: [] }) }, 'actor');
    const stored = await site.getHomeContent();
    expect(stored.steps).toEqual([]);
    expect(stored.entries).toEqual([]);
    expect(stored.heroTitle).toBe('欢迎来到社区');
  });
  it('trims whitespace before storing', async () => {
    await site.updateSettings({ homeContent: content({ heroTitle: '  带空格的标题  ' }) }, 'actor');
    expect((await site.getHomeContent()).heroTitle).toBe('带空格的标题');
  });
  describe('rejects unsafe or oversized input', () => {
    it.each([
      [
        'a protocol-relative link',
        content({ primaryAction: { label: 'x', href: '//evil.example' } }),
      ],
      [
        'a javascript: link',
        content({ primaryAction: { label: 'x', href: 'javascript:alert(1)' } }),
      ],
      ['a plain word as link', content({ secondaryAction: { label: 'x', href: 'example.com' } })],
      [
        'an entry link that is not absolute',
        content({ entries: [{ title: 't', description: 'd', href: 'ftp://x', actionLabel: 'a' }] }),
      ],
      ['an empty hero title', content({ heroTitle: '' })],
      [
        'too many stats',
        content({ stats: Array.from({ length: 5 }, () => ({ label: 'a', value: 'b' })) }),
      ],
      ['too many steps', content({ steps: Array.from({ length: 7 }, (_, i) => `第 ${i} 步`) })],
    ])('rejects %s', async (_label, input) => {
      await expect(site.updateSettings({ homeContent: input }, 'actor')).rejects.toThrow(
        BadRequestException,
      );
    });
    it('leaves the previous content untouched after a rejection', async () => {
      await site.updateSettings({ homeContent: content({ heroTitle: '第一版' }) }, 'actor');
      await expect(
        site.updateSettings({ homeContent: content({ heroTitle: '' }) }, 'actor'),
      ).rejects.toThrow(BadRequestException);
      expect((await site.getHomeContent()).heroTitle).toBe('第一版');
    });
  });
  it('falls back to defaults when the stored row is unreadable', async () => {
    const fallback = await site.getHomeContent();
    await ctx.db.db
      .insert(siteSetting)
      .values({ key: 'homeContent', value: '{"heroTitle":', updatedAt: new Date() });
    const repaired = await site.getHomeContent();
    expect(repaired).toEqual(fallback);
  });
  it('exposes approved, in-window banners through the public home payload', async () => {
    const now = new Date();
    await ctx.db.db.insert(banner).values([
      {
        userId: 'actor',
        title: '上线中的 Banner',
        description: '描述',
        href: 'https://example.com',
        status: 'approved',
        pointsSpent: 500,
        startsAt: new Date(now.getTime() - 60000),
        endsAt: new Date(now.getTime() + 60 * 60 * 1000),
      },
      {
        userId: 'actor',
        title: '待审核 Banner',
        status: 'pending',
        pointsSpent: 500,
      },
      {
        userId: 'actor',
        title: '已过期 Banner',
        status: 'approved',
        pointsSpent: 500,
        startsAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() - 60000),
      },
    ]);
    const titles = (await site.getHome()).banners.map((row) => row.title);
    expect(titles).toEqual(['上线中的 Banner']);
    expect((await site.getHome()).banners[0]?.ownerName).toBe('Actor');
  });
  it('writes an audit row for a content change', async () => {
    await site.updateSettings({ homeContent: content() }, 'actor');
    const stored = (
      await ctx.db.db
        .select({ key: siteSetting.key, updatedBy: siteSetting.updatedBy })
        .from(siteSetting)
        .where(eq(siteSetting.key, 'homeContent'))
    )[0];
    expect(stored?.updatedBy).toBe('actor');
  });
});
