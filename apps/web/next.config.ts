import type { NextConfig } from 'next';

/**
 * Optional secret path for the root console. Set CONSOLE_PATH (e.g.
 * `/ops-7f3a`) when building/starting the web app; `/console` keeps working.
 */
const consolePath = process.env.CONSOLE_PATH?.trim();
const consoleRewrite =
  consolePath !== undefined &&
  consolePath !== '' &&
  consolePath !== '/console' &&
  /^\/[A-Za-z0-9/_-]+$/.test(consolePath)
    ? [{ source: consolePath, destination: '/console' }]
    : [];

const apiProxyTarget = process.env.API_PROXY_TARGET?.trim();
const apiRewrite =
  apiProxyTarget !== undefined && apiProxyTarget !== ''
    ? [{ source: '/api/:path*', destination: `${apiProxyTarget}/api/:path*` }]
    : [];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Docker 单镜像部署：`next build` 额外产出自包含的 .next/standalone。
  // 注意 rewrites 里的 API_PROXY_TARGET 在构建时被序列化进产物，运行时改环境变量
  // 不生效——镜像构建时烘焙 http://127.0.0.1:8000（见根目录 Dockerfile）。
  output: 'standalone',
  // Monorepo：Turbopack 要求工作区根包含全部被编译文件（含根 node_modules 里的
  // next 本身），因此追踪根必须是仓库根。代价是 standalone 呈 monorepo 布局：
  // .next/standalone/apps/web/server.js + .next/standalone/node_modules，
  // Dockerfile 与 entrypoint 按此路径拷贝/启动。shared 的运行时取值已被
  // Turbopack 内联进 chunks，不依赖 node_modules。
  outputFileTracingRoot: `${process.cwd()}/../../`,
  async rewrites() {
    return [...apiRewrite, ...consoleRewrite];
  },
  async redirects() {
    return [
      { source: '/growth', destination: '/forum/growth', permanent: true },
      { source: '/settings', destination: '/textures', permanent: true },
    ];
  },
  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
      },
    ];
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
