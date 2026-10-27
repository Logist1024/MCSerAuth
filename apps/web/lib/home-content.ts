import type { BannerSummary, HomeContent, PublicHomeResponse } from '@mcserauth/shared';
import { publicApiFetch } from './server-api';

/**
 * Built-in landing content used when the API is unreachable or has no stored
 * `homeContent` yet. Shape must satisfy `HomeContent` (packages/shared/src/site.ts).
 */
export const DEFAULT_HOME_CONTENT: HomeContent = {
  heroEyebrow: 'Minecraft 服务器社区',
  heroTitle: 'MCSerAuth 社区',
  heroText: '一个账号，论坛与游戏通用。',
  primaryAction: { label: '进入论坛', href: '/forum' },
  secondaryAction: { label: '前往游戏账号管理', href: '/textures' },
  stats: [],
  steps: ['注册社区账号。', '在启动器中添加本站外置登录地址。', '进入服务器，皮肤与披风自动同步。'],
  entries: [
    {
      title: '游戏账号管理',
      description: '管理游戏角色、皮肤与披风，游戏内立即生效。',
      href: '/textures',
      actionLabel: '进入游戏账号管理 →',
    },
    {
      title: '玩家论坛',
      description: '服务器动态、攻略与闲聊。',
      href: '/forum',
      actionLabel: '进入论坛 →',
    },
  ],
};

export interface HomeData {
  content: HomeContent;
  banners: BannerSummary[];
  /** True when `GET /api/site/home` was unreachable and defaults are shown. */
  usingDefaultContent: boolean;
}

/**
 * Fills a partially-stored content object from the defaults.
 * Missing (undefined) fields fall back; intentionally empty arrays stay empty
 * so the page can skip those sections ("取到空数组→该区块不渲染").
 */
function normalizeHomeContent(content: Partial<HomeContent> | null | undefined): HomeContent {
  if (!content) {
    return DEFAULT_HOME_CONTENT;
  }
  return {
    heroEyebrow: content.heroEyebrow ?? DEFAULT_HOME_CONTENT.heroEyebrow,
    heroTitle: content.heroTitle ?? DEFAULT_HOME_CONTENT.heroTitle,
    heroText: content.heroText ?? DEFAULT_HOME_CONTENT.heroText,
    primaryAction: content.primaryAction ?? DEFAULT_HOME_CONTENT.primaryAction,
    secondaryAction: content.secondaryAction ?? DEFAULT_HOME_CONTENT.secondaryAction,
    stats: content.stats ?? DEFAULT_HOME_CONTENT.stats,
    steps: content.steps ?? DEFAULT_HOME_CONTENT.steps,
    entries: content.entries ?? DEFAULT_HOME_CONTENT.entries,
  };
}

/**
 * `GET /api/site/home` for the landing page (public, cookie-less, cached).
 * Never throws: on any failure the page renders the built-in default content
 * instead, without exposing technical errors to visitors.
 */
export async function loadHome(): Promise<HomeData> {
  const home = await publicApiFetch<PublicHomeResponse>('/api/site/home', 15);
  const banners = home !== null && Array.isArray(home.banners) ? home.banners : [];
  return {
    content: normalizeHomeContent(home?.content),
    banners,
    usingDefaultContent: home === null,
  };
}
