import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'MCSerAuth',
    template: '%s · MCSerAuth',
  },
  description: 'Minecraft 服务器外置登录认证与社区平台',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="shell">
          <header className="site-header">
            <a className="brand" href="/">
              MCSerAuth
            </a>
            <span className="tagline">外置登录认证 · M0 底座</span>
          </header>
          <main className="site-main">{children}</main>
          <footer className="site-footer">
            <span>M0 骨架阶段：页面仅用于验证服务端联通性，业务页面随里程碑交付。</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
