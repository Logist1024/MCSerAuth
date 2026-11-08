import { z } from 'zod';
import type { UserRole } from '../enums.js';
import type { PROTOCOL_TOKEN_TYPE } from './common.js';

/**
 * OAuth-style account/authorization endpoints.
 *
 * Provisional contract: field names may still drift from the Commons-Designs
 * spec; this package (src/protocol/) is the single source of truth for the
 * current field values.
 *
 * Registered clients (managed via /api/admin/oauth-clients) get strict
 * validation: exact redirect_uri matching and scope allow-lists. Launchers
 * without a client_id keep the legacy behaviour (any HTTPS/localhost redirect,
 * all scopes).
 */

/**
 * OAuth scopes for registered clients. `basic` is always implied; `player`
 * unlocks the game identity (UUID) that sibling services need; `email`
 * unlocks the account email.
 */
export const OAUTH_SCOPES = ['basic', 'player', 'email'] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];

/** Chinese labels shown on the consent page next to each scope. */
export const OAUTH_SCOPE_LABELS: Record<OAuthScope, string> = {
  basic: '账号基本信息（ID 与昵称）',
  player: '游戏角色信息（玩家 UUID 与昵称）',
  email: '注册邮箱地址',
};

/** Scopes granted when the client omits the `scope` parameter. */
export const OAUTH_DEFAULT_SCOPES: readonly OAuthScope[] = ['basic', 'player'];

/** Parses a space-separated scope string onto the known scope set. */
export function parseOAuthScopes(raw: string | null | undefined): OAuthScope[] {
  const parts = (raw ?? '')
    .split(/[\s+]+/)
    .map((part) => part.trim())
    .filter((part): part is OAuthScope => (OAUTH_SCOPES as readonly string[]).includes(part));
  return [...new Set(parts)];
}

/** GET /api/oauth/availability */
export interface OAuthAvailabilityResponse {
  available: boolean;
}

/** GET /api/oauth/entry — browser-facing consent page query. */
export const oauthEntryQuerySchema = z.object({
  client_id: z.string().min(1).optional(),
  redirect_uri: z.string().min(1).optional(),
  response_type: z.string().min(1).optional(),
  scope: z.string().optional(),
  state: z.string().optional(),
  code_challenge: z.string().optional(),
  code_challenge_method: z.enum(['S256', 'plain']).optional(),
});
export type OAuthEntryQuery = z.infer<typeof oauthEntryQuerySchema>;

/**
 * POST /api/oauth/entry — consent form submission.
 *
 * The consent page is rendered by NestJS so it shares the better-auth cookie.
 * Submitting the form issues a single-use authorization code and redirects to
 * `redirect_uri` with `code` + `state`. When `remember` is checked the grant
 * is stored per client, so later logins skip the consent page entirely.
 */
export const oauthEntryConsentSchema = oauthEntryQuerySchema.extend({
  redirect_uri: z.string().min(1),
  response_type: z.literal('code').optional(),
  remember: z.union([z.literal('on'), z.literal('true'), z.literal('1'), z.boolean()]).optional(),
});
export type OAuthEntryConsentRequest = z.infer<typeof oauthEntryConsentSchema>;

/** POST /api/oauth/authenticate */
export const oauthAuthenticateRequestSchema = z.object({
  code: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
  client_id: z.string().min(1).optional(),
  client_secret: z.string().min(1).optional(),
  redirect_uri: z.string().min(1).optional(),
  code_verifier: z.string().min(1).optional(),
});
export type OAuthAuthenticateRequest = z.infer<typeof oauthAuthenticateRequestSchema>;

/** POST /api/oauth/refresh */
export const oauthRefreshRequestSchema = z.object({
  refresh_token: z.string().min(1),
  client_id: z.string().min(1).optional(),
  /** Required when the token belongs to a confidential registered client. */
  client_secret: z.string().min(1).optional(),
});
export type OAuthRefreshRequest = z.infer<typeof oauthRefreshRequestSchema>;

export interface OAuthUserSummary {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

/** Shared token payload for authenticate/refresh. */
export interface OAuthTokenResponse {
  access_token: string;
  token_type: typeof PROTOCOL_TOKEN_TYPE;
  expires_in: number;
  refresh_token: string;
  /** Granted scopes; always set for registered-client flows. */
  scope?: string;
  user?: OAuthUserSummary;
}

/**
 * GET /api/oauth/userinfo — scope-filtered account info for sibling services.
 *
 * `basic` yields `user.id`/`user.name`; `email` additionally yields
 * `user.email`; `player` additionally yields the `player` object carrying the
 * Minecraft UUID. `basic` is always granted implicitly.
 */
export interface OAuthUserInfoResponse {
  user: {
    id: string;
    name: string;
    email?: string;
  };
  player?: {
    uuid: string;
    nickname: string;
    banned: boolean;
  };
}

/** GET /api/user/profiles/me */
export interface UserProfilesMeResponse {
  user: OAuthUserSummary;
  player: {
    uuid: string;
    nickname: string;
    banned: boolean;
  } | null;
}
