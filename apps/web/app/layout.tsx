import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import SiteHeader from '@/components/site-header';
import { ToastProvider } from '@/components/toast';
import { APPEARANCE_INIT_SCRIPT } from '@/lib/appearance';
import { loadSiteDisplay } from '@/lib/site-settings';
import './globals.css';

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0f12' },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const site = await loadSiteDisplay();
  return {
    title: {
      default: site.siteName,
      template: `%s · ${site.siteName}`,
    },
    description: site.description,
    icons: site.iconUrl === null ? undefined : { icon: site.iconUrl, apple: site.iconUrl },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const site = await loadSiteDisplay();
  return (
    <html
      lang="zh-CN"
      data-scroll-behavior="smooth"
      data-theme-mode="system"
      data-theme-color="green"
      data-icon-style="svg"
      // 内联初始化脚本会在水合前改写这三个 data 属性（外观偏好），
      // 服务端默认值与客户端实际值不同是预期行为，抑制该属性级警告。
      suppressHydrationWarning
    >
      <body>
        {/* 首帧前把外观偏好写到 <html> 的 data 属性，避免主题闪烁。 */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_INIT_SCRIPT }} />
        {/* Rendered last in the document order so it can override the built-in theme. */}
        {site.customCss !== null ? (
          <style dangerouslySetInnerHTML={{ __html: site.customCss }} />
        ) : null}
        <a className="skip-link" href="#main">
          跳到主要内容
        </a>
        <ToastProvider>
          <SiteHeader siteName={site.siteName} tagline={site.tagline} iconUrl={site.iconUrl} />
          <main className="site-main" id="main" tabIndex={-1}>
            {site.announcement !== null ? (
              <div className="site-announcement" role="status">
                <span className="site-announcement-dot" aria-hidden="true" />
                {site.announcement}
              </div>
            ) : null}
            {children}
          </main>
          <footer className="site-footer">
            <div className="site-footer-inner">
              <span>{site.footerText}</span>
              <nav className="footer-links" aria-label="页脚导航">
                <Link href="/forum">论坛</Link>
                <Link href="/textures">游戏账号管理</Link>
                <Link href="/forum/rss.xml">RSS</Link>
                {site.contactEmail !== null ? (
                  <a href={`mailto:${site.contactEmail}`}>联系</a>
                ) : null}
              </nav>
            </div>
          </footer>
        </ToastProvider>
      </body>
    </html>
  );
}
