import { z } from 'zod';
import type { GameProfile } from './session.js';

/**
 * authlib-injector / Yggdrasil compatibility surface.
 *
 * HMCL and PCL2 talk to an "API root" (`<root>/authserver/*`,
 * `<root>/sessionserver/*`, `<root>/api/profiles/minecraft`,
 * `<root>/minecraft/profile/*`) and read the server metadata from `<root>`
 * itself. These shapes mirror that contract; the Commons-Designs OAuth flow in
 * `./oauth.ts` stays the native protocol and is untouched.
 */

/** `{ name: 'Minecraft', version: 1 }` — accepted but not enforced. */
export const yggdrasilAgentSchema = z.object({
  name: z.string().min(1),
  version: z.number().int(),
});
export type YggdrasilAgent = z.infer<typeof yggdrasilAgentSchema>;

/** Game identity handed to launchers (`id` is a dashless 32-hex UUID). */
export interface YggdrasilProfile {
  id: string;
  name: string;
}

export interface YggdrasilUser {
  id: string;
  properties?: { name: string; value: string }[];
}

/** POST <root>/authserver/authenticate */
export const yggdrasilAuthenticateRequestSchema = z.object({
  agent: yggdrasilAgentSchema.optional(),
  /** Website account email (username field is shared by both). */
  username: z.string().min(1),
  password: z.string().min(1),
  clientToken: z.string().min(1).optional(),
  requestUser: z.boolean().optional(),
});
export type YggdrasilAuthenticateRequest = z.infer<typeof yggdrasilAuthenticateRequestSchema>;

export interface YggdrasilAuthenticateResponse {
  accessToken: string;
  clientToken: string;
  availableProfiles: YggdrasilProfile[];
  selectedProfile?: YggdrasilProfile;
  user?: YggdrasilUser;
}

/** POST <root>/authserver/refresh */
export const yggdrasilRefreshRequestSchema = z.object({
  accessToken: z.string().min(1),
  clientToken: z.string().min(1).optional(),
  requestUser: z.boolean().optional(),
});
export type YggdrasilRefreshRequest = z.infer<typeof yggdrasilRefreshRequestSchema>;

export interface YggdrasilRefreshResponse {
  accessToken: string;
  clientToken: string;
  selectedProfile?: YggdrasilProfile;
  user?: YggdrasilUser;
}

/** POST <root>/authserver/validate — 204 when valid, 403 when not. */
export const yggdrasilValidateRequestSchema = z.object({
  accessToken: z.string().min(1),
  clientToken: z.string().min(1).optional(),
});
export type YggdrasilValidateRequest = z.infer<typeof yggdrasilValidateRequestSchema>;

/** POST <root>/authserver/invalidate — always 204. */
export type YggdrasilInvalidateRequest = YggdrasilValidateRequest;

/**
 * POST <root>/sessionserver/session/minecraft/join
 *
 * `serverId` is the per-handshake hash the game server computes, *not* the
 * admin-registered whitelist id used by the native `/api/session/*` endpoints.
 */
export const yggdrasilJoinRequestSchema = z.object({
  accessToken: z.string().min(1),
  selectedProfile: z.string().min(1),
  serverId: z.string().min(1),
});
export type YggdrasilJoinRequest = z.infer<typeof yggdrasilJoinRequestSchema>;

/** GET <root>/sessionserver/session/minecraft/hasJoined */
export const yggdrasilHasJoinedQuerySchema = z.object({
  username: z.string().min(1),
  serverId: z.string().min(1),
  ip: z.string().min(1).optional(),
});
export type YggdrasilHasJoinedQuery = z.infer<typeof yggdrasilHasJoinedQuerySchema>;

export type YggdrasilProfileResponse = GameProfile;

/**
 * GET <root> — API metadata.
 *
 * `signaturePublickey` is intentionally omitted: textures handed out by this
 * server are unsigned, and authlib-injector skips signature verification
 * entirely when the key is absent.
 */
export interface YggdrasilMetadata {
  meta: {
    serverName: string;
    implementationName: string;
    implementationVersion: string;
    links?: { homepage?: string };
  };
  skinDomains: string[];
  signaturePublickey?: string;
}
