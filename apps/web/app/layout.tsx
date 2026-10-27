import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import SiteHeader from '@/components/site-header';
import { ToastProvider } from '@/components/toast';
import { loadSiteDisplay } from '@/lib/site-settings';
import './globals.css';

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ecefed' },
    { media: '(prefers-color-scheme: dark)', color: '#090c0a' },
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
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body>
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
