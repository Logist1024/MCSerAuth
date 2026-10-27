/**
 * Thin browser-side wrapper around better-auth's `/api/auth/*` routes.
 *
 * These endpoints do not use the project's `{ code, data }` envelope; errors
 * are surfaced as `AuthClientError` with better-auth's readable message.
 */
import type { UserRole } from '@mcserauth/shared';
import { API_BASE_URL } from './api-client';

export interface WebsiteSession {
  session: {
    id: string;
    expiresAt: string;
  };
  user: {
    id: string;
    email: string;
    name: string;
    role?: UserRole;
    banned?: boolean;
  };
}

export class AuthClientError extends Error {
  readonly status: number;
  /** better-auth machine-readable code, e.g. `INVALID_PASSWORD`; may be empty. */
  readonly code: string;

  constructor(message: string, status: number, code = '') {
    super(message);
    this.name = 'AuthClientError';
    this.status = status;
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Header names carrying a one-shot human-verification token. */
export const CAPTCHA_HEADER = 'x-captcha-token';

function captchaHeaders(captchaToken?: string): Record<string, string> {
  return captchaToken === undefined || captchaToken === ''
    ? {}
    : { [CAPTCHA_HEADER]: captchaToken };
}

async function authRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T | null> {
  const { method = 'GET', body, headers = {} } = options;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new AuthClientError(
      `无法连接认证服务（${API_BASE_URL}）：${error instanceof Error ? error.message : String(error)}`,
      0,
    );
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const code = isRecord(payload) && typeof payload.code === 'string' ? payload.code : '';
    const message =
      isRecord(payload) && typeof payload.message === 'string'
        ? payload.message
        : `认证请求失败（HTTP ${response.status}）`;
    throw new AuthClientError(message, response.status, code);
  }

  return payload as T | null;
}

export async function fetchWebsiteSession(): Promise<WebsiteSession | null> {
  return authRequest<WebsiteSession>('/api/auth/get-session');
}

export async function signUpWithEmail(
  input: { email: string; password: string; name: string },
  captchaToken?: string,
): Promise<void> {
  await authRequest('/api/auth/sign-up/email', {
    method: 'POST',
    body: {
      ...input,
      // After the user opens the verification link, better-auth redirects
      // back here (autoSignInAfterVerification creates the session).
      callbackURL: `${window.location.origin}/login?verified=1`,
    },
    headers: captchaHeaders(captchaToken),
  });
}

export async function signInWithEmail(
  input: { email: string; password: string },
  captchaToken?: string,
): Promise<void> {
  await authRequest('/api/auth/sign-in/email', {
    method: 'POST',
    body: input,
    headers: captchaHeaders(captchaToken),
  });
}

export async function signOut(): Promise<void> {
  await authRequest('/api/auth/sign-out', { method: 'POST', body: {} });
}

/**
 * `POST /api/auth/send-verification-email` — better-auth built-in resend.
 * Used after sign-up (the account has no session yet) and when sign-in is
 * rejected because the address is not verified.
 */
export async function resendVerificationEmail(email: string): Promise<void> {
  await authRequest('/api/auth/send-verification-email', {
    method: 'POST',
    body: {
      email,
      callbackURL: `${window.location.origin}/login?verified=1`,
    },
  });
}

/**
 * `POST /api/auth/request-password-reset` — better-auth 1.7 renamed this
 * endpoint (`/forget-password` now answers 404) and sends a one-hour reset
 * link. The origin-check middleware narrows `redirectTo` to trusted origins;
 * `${origin}/reset-password` is where the email link lands.
 */
export async function requestPasswordReset(email: string, captchaToken?: string): Promise<void> {
  await authRequest('/api/auth/request-password-reset', {
    method: 'POST',
    body: {
      email,
      redirectTo: `${window.location.origin}/reset-password`,
    },
    headers: captchaHeaders(captchaToken),
  });
}

/** `POST /api/auth/reset-password` — sets the new password with the emailed token. */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await authRequest('/api/auth/reset-password', {
    method: 'POST',
    body: { token, newPassword },
  });
}

/** better-auth machine codes → readable messages; unknown codes fall through. */
const AUTH_CODE_MESSAGES: Record<string, string> = {
  INVALID_PASSWORD: '当前密码不正确',
  PASSWORD_TOO_SHORT: '新密码太短（至少 8 位）',
  PASSWORD_TOO_LONG: '新密码太长',
  CREDENTIAL_ACCOUNT_NOT_FOUND: '该账号未设置密码登录',
  EMAIL_NOT_VERIFIED: '邮箱尚未验证，请先到邮箱打开验证链接',
  INVALID_TOKEN: '链接无效或已过期，请重新申请',
};

export function describeAuthError(error: unknown): string {
  if (error instanceof AuthClientError) {
    const mapped = AUTH_CODE_MESSAGES[error.code];
    if (mapped !== undefined) {
      return mapped;
    }
    if (/email not verified/i.test(error.message)) {
      return '邮箱尚未验证，请先到邮箱打开验证链接';
    }
    if (/invalid password/i.test(error.message)) {
      return '当前密码不正确';
    }
  }
  return error instanceof Error ? error.message : String(error);
}

/** Sign-in rejected because the address has not been verified yet? */
export function isUnverifiedEmailError(error: unknown): boolean {
  if (error instanceof AuthClientError) {
    return error.code === 'EMAIL_NOT_VERIFIED' || /email not verified/i.test(error.message);
  }
  return false;
}

/**
 * `POST /api/auth/change-password` — better-auth built-in. With
 * `revokeOtherSessions` the other website sessions are deleted and this
 * session is rotated (fresh cookie in response).
 */
export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
  revokeOtherSessions?: boolean;
}): Promise<void> {
  await authRequest('/api/auth/change-password', {
    method: 'POST',
    body: {
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      ...(input.revokeOtherSessions === undefined
        ? {}
        : { revokeOtherSessions: input.revokeOtherSessions }),
    },
  });
}
