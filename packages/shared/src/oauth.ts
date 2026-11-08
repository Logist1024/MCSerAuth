/**
 * OAuth client administration and per-account authorization DTOs.
 *
 * These back the `{code,data}` envelope APIs (admin management plus the
 * website's "已授权服务" panel), so — unlike `protocol/oauth.ts` — they are
 * plain interfaces without zod schemas.
 */
import type { OAuthScope } from './protocol/oauth.js';

/** Admin view of a registered OAuth client. `clientSecret` only appears right after create/reset. */
export interface AdminOauthClientView {
  id: number;
  clientId: string;
  name: string;
  description: string | null;
  redirectUris: string[];
  allowedScopes: OAuthScope[];
  enabled: boolean;
  /** True when the client must present a client_secret on token exchange. */
  confidential: boolean;
  createdAt: string;
  updatedAt: string;
  clientSecret?: string;
}

export interface AdminOauthClientListQuery {
  page?: number;
  pageSize?: number;
}

export interface AdminOauthClientListResponse {
  items: AdminOauthClientView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateOauthClientRequest {
  /** Stable public identifier; generated when omitted. */
  clientId?: string;
  name: string;
  description?: string;
  redirectUris: string[];
  allowedScopes?: OAuthScope[];
  /** Omit for a public (PKCE-only) client. */
  clientSecret?: string;
  enabled?: boolean;
}

export interface UpdateOauthClientRequest {
  name?: string;
  description?: string | null;
  redirectUris?: string[];
  allowedScopes?: OAuthScope[];
  enabled?: boolean;
}

/** One service the account has granted consent to, for the website panel. */
export interface UserAuthorizationView {
  clientId: string;
  clientName: string;
  scopes: OAuthScope[];
  grantedAt: string;
  /** Number of live (non-revoked, non-expired) token pairs for this client. */
  activeTokens: number;
}
