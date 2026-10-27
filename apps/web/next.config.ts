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

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return consoleRewrite;
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
