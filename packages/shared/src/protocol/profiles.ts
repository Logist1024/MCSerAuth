import { z } from 'zod';
import type { GameProfile } from './session.js';

/**
 * Player profile / texture endpoints consumed by server mods and launchers.
 * See docs/protocol-checklist.md for the still-unverified field list.
 */

/** GET /api/profiles/{uuid} */
export type ProfileLookupResponse = GameProfile;

/** POST /api/profiles/minecraft — batch lookup by nickname. */
export const profilesBatchRequestSchema = z.object({
  names: z.array(z.string().min(1)).min(1).max(10),
});
export type ProfilesBatchRequest = z.infer<typeof profilesBatchRequestSchema>;

export type ProfilesBatchResponse = GameProfile[];

export type TextureState = 'ACTIVE' | 'INACTIVE';
export type TextureVariant = 'CLASSIC' | 'SLIM';

export interface SkinTexture {
  id: string;
  state: TextureState;
  url: string;
  variant: TextureVariant;
  alias?: string;
}

export interface CapeTexture {
  id: string;
  state: TextureState;
  url: string;
  alias?: string;
}

/** GET /minecraft/profile (skins + capes), reused by skin/cape sub-routes. */
export interface MinecraftProfileResponse {
  id: string;
  name: string;
  skins: SkinTexture[];
  capes: CapeTexture[];
}

/** POST /minecraft/profile/skins (multipart: `variant` + `file`). */
export const skinUploadMetadataSchema = z.object({
  variant: z.enum(['classic', 'slim']),
});
export type SkinUploadMetadata = z.infer<typeof skinUploadMetadataSchema>;

/** POST /minecraft/profile/capes (multipart: `file`). */
export interface CapeUploadMetadata {
  /** Reserved for future aliases; the spec currently accepts the file only. */
  alias?: string;
}
