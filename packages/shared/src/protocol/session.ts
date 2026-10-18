import { z } from 'zod';

/**
 * Minecraft session service (called by game servers).
 * Yggdrasil-compatible naming is used; see docs/protocol-checklist.md.
 */

/** POST /api/session/joinServer */
export const joinServerRequestSchema = z.object({
  accessToken: z.string().min(1),
  /** Player UUID, lowercase hex without dashes. */
  selectedProfile: z.string().min(1),
  serverId: z.string().min(1),
});
export type JoinServerRequest = z.infer<typeof joinServerRequestSchema>;

/** POST /api/session/hasJoined */
export const hasJoinedQuerySchema = z.object({
  username: z.string().min(1),
  serverId: z.string().min(1),
  ip: z.string().min(1).optional(),
});
export type HasJoinedQuery = z.infer<typeof hasJoinedQuerySchema>;

export interface GameProfileProperty {
  name: string;
  value: string;
  signature?: string;
}

/** Yggdrasil GameProfile; `id` is a dashless UUID. */
export interface GameProfile {
  id: string;
  name: string;
  properties?: GameProfileProperty[];
  profileActions?: string[];
}

/** 200 payload of hasJoined (204/empty when no session exists). */
export type HasJoinedResponse = GameProfile;
