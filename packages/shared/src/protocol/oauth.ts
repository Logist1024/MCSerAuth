import { z } from 'zod';
import type { UserRole } from '../enums.js';
import type { PROTOCOL_TOKEN_TYPE } from './common.js';

/**
 * OAuth-style account/authorization endpoints.
 *
 * M0 provisional contract: shapes are registered in Swagger so launchers can
 * be pointed at the stubs and the real requests can be recorded. Field names
 * are reconciled against the Commons-Designs spec in docs/protocol-checklist.md.
 */

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

/** POST /api/oauth/authenticate */
export const oauthAuthenticateRequestSchema = z.object({
  code: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
  client_id: z.string().min(1).optional(),
  redirect_uri: z.string().min(1).optional(),
  code_verifier: z.string().min(1).optional(),
});
export type OAuthAuthenticateRequest = z.infer<typeof oauthAuthenticateRequestSchema>;

/** POST /api/oauth/refresh */
export const oauthRefreshRequestSchema = z.object({
  refresh_token: z.string().min(1),
  client_id: z.string().min(1).optional(),
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
  scope?: string;
  user?: OAuthUserSummary;
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
