import type { CaptchaProvider } from './enums.js';

/** Public captcha configuration fetched by the login/register UI. */
export interface CaptchaPublicConfig {
  enabled: boolean;
  provider: CaptchaProvider;
  /** Site key for Turnstile/hCaptcha; null for the built-in SVG captcha. */
  siteKey: string | null;
}

export interface CaptchaChallengeResponse {
  id: string;
  /** Inline SVG challenge; only returned by the built-in provider. */
  svg: string;
  expiresAt: string;
}

export interface CaptchaVerifyRequest {
  /** Built-in provider: answer bound to the challenge id. */
  id?: string;
  answer?: string;
  /** Turnstile/hCaptcha: widget token, no challenge id required. */
  token?: string;
}

export interface CaptchaVerifyResponse {
  /** Short-lived HMAC token sent as `x-captcha-token` on auth requests. */
  token: string;
  expiresAt: string;
}

/** Admin-only view: never exposes the stored secret. */
export interface CaptchaSettings {
  enabled: boolean;
  provider: CaptchaProvider;
  siteKey: string | null;
  secretSet: boolean;
}

export interface UpdateCaptchaSettingsRequest {
  enabled?: boolean;
  provider?: CaptchaProvider;
  siteKey?: string | null;
  /** Empty string clears the stored secret. */
  secret?: string | null;
}
