import { randomBytes } from 'node:crypto';

/**
 * Content-Security-Policy for the API server's own HTML (F3 / T9).
 *
 * helmet stays in charge of every other security header; this module owns the
 * CSP header because it needs a per-request nonce for the OAuth entry pages'
 * inline styles/script. Swagger (`/docs*`) gets a relaxed policy instead —
 * swagger-ui ships inline bootstrap scripts that cannot carry a nonce.
 *
 * The strict policy keeps `script-src` free of `unsafe-inline` (the XSS
 * crown jewel) by requiring the nonce; third-party captcha providers
 * (Turnstile / hCaptcha) are allowed by origin and render inside their own
 * iframes, so `style-src` can stay strict too.
 */

export const CSP_NONCE_KEY = 'cspNonce';

/** Origins loaded by the captcha providers configured in `src/modules/captcha`. */
const CAPTCHA_ORIGINS = [
  'https://challenges.cloudflare.com',
  'https://js.hcaptcha.com',
  'https://*.hcaptcha.com',
];

export function generateCspNonce(): string {
  return randomBytes(16).toString('base64');
}

/** Strict policy for pages this server renders (OAuth entry / consent). */
export function strictCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' ${CAPTCHA_ORIGINS.join(' ')}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "connect-src 'self'",
    `frame-src ${CAPTCHA_ORIGINS.join(' ')}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}

/** Relaxed policy for swagger-ui, which requires inline bootstrap scripts. */
export function docsCsp(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}

/** True when the request path is served by swagger-ui. */
export function isDocsPath(path: string): boolean {
  return path === '/docs' || path.startsWith('/docs/');
}
