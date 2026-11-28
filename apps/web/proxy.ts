import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Per-request nonce CSP for the web render layer, mirroring the API's
 * `strictCsp` (apps/server/src/common/csp.ts) as defense in depth: the API
 * already protects its responses, but :3000 is where all user-visible HTML
 * ships from.
 *
 * - `script-src` keeps the same host allowlist shape as the server (captcha
 *   loaders are injected at runtime, not via nonce'd framework scripts).
 * - `style-src` needs `'unsafe-inline'`: React style attributes are used
 *   across the UI and cannot carry a nonce.
 * - `img-src` allows http(s): because forum Markdown renders arbitrary
 *   author-provided image URLs and signed texture/avatar URLs point at the
 *   API origin.
 *
 * Note: a nonce-based CSP forces dynamic rendering for every page (the home
 * page loses its 30s cache window; the API's own ~15s cache still applies).
 */
const CAPTCHA_HOSTS =
  'https://challenges.cloudflare.com https://js.hcaptcha.com https://*.hcaptcha.com';

function extraApiOrigin(requestOrigin: string): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';
  try {
    const origin = new URL(configured).origin;
    return origin === requestOrigin ? '' : ` ${origin}`;
  } catch {
    return '';
  }
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';
  const requestOrigin = new URL(request.url).origin;
  const contentSecurityPolicyHeaderValue = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ''} ${CAPTCHA_HOSTS}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: http: https:",
    "font-src 'self'",
    `connect-src 'self'${extraApiOrigin(requestOrigin)}`,
    `frame-src ${CAPTCHA_HOSTS}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  // Next.js parses this request header and attaches the nonce to its own
  // inline scripts/bundles during SSR (docs: app/guides/content-security-policy);
  // app/layout.tsx reads x-nonce for the hand-written appearance init script.
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicyHeaderValue);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', contentSecurityPolicyHeaderValue);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (rewritten to the NestJS API, which sets its own CSP)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
