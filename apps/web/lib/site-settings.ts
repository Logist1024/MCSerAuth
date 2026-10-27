import type { SiteDisplaySettings } from '@mcserauth/shared';
import { publicApiFetch } from './server-api';

/** Used when the API is unreachable (build-time or a cold start). */
export const FALLBACK_SITE_DISPLAY: SiteDisplaySettings = {
  siteName: 'MCSerAuth 社区',
  tagline: 'Minecraft 服务器社区',
  description: 'Minecraft 服务器外置登录认证与玩家社区平台',
  footerText: 'MCSerAuth 社区 · 外置登录与玩家社区',
  announcement: null,
  contactEmail: null,
  iconUrl: null,
  customCss: null,
};

/** Server-side display settings with a short revalidate window. */
export async function loadSiteDisplay(): Promise<SiteDisplaySettings> {
  return (await publicApiFetch<SiteDisplaySettings>('/api/site', 15)) ?? FALLBACK_SITE_DISPLAY;
}
