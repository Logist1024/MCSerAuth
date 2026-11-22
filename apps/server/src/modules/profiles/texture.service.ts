import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type ActivateTextureResponse,
  type DeleteTextureResponse,
  type GameProfile,
  type MinecraftProfileResponse,
  type Paginated,
  type SkinKind,
  type SkinStatus,
  type SkinVariant,
  type TextureUploadResponse,
} from '@mcserauth/shared';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp, { type Metadata } from 'sharp';
import { AppConfigService } from '../../config/app-config.service.js';
import { firstOrThrow } from '../../common/helpers/rows.js';
import { UploadQuotaService } from '../../common/services/upload-quota.service.js';
import { DbService } from '../../db/db.service.js';
import { moderationLog, player as playerTable, skin as skinTable } from '../../db/schema/index.js';
import { ProgressService } from '../growth/progress.service.js';
type PlayerRow = typeof playerTable.$inferSelect;
type SkinRow = typeof skinTable.$inferSelect;
/** Multer hard limit; Minecraft textures are tiny (<= 64x64 PNG). */
export const MAX_TEXTURE_BYTES = 1024 * 1024;
/** Daily upload cap per account. */
export const MAX_TEXTURE_UPLOADS_PER_DAY = 20;
const ALLOWED_DIMENSIONS: Record<SkinKind, readonly string[]> = {
  skin: ['64x32', '64x64'],
  cape: ['64x32'],
};
/**
 * Value stored in `skin.active_slot` for the single active row of a player/kind.
 *
 * MySQL cannot express a partial unique index, so the generator emits a plain
 * unique index over (player_uuid, kind, active_slot) and inactive rows keep
 * `active_slot = NULL` (NULLs never collide in any of the three dialects).
 */
function activeSlotOf(playerUuid: string, kind: SkinKind): string {
  return `${playerUuid}:${kind}`;
}
export interface TextureReviewView {
  id: number;
  playerUuid: string;
  nickname: string;
  kind: SkinKind;
  variant: SkinVariant | null;
  status: SkinStatus;
  isActive: boolean;
  uploadedAt: Date;
  url: string;
}
/**
 * Texture pipeline: PNG validation, content-addressed local storage, signed
 * distribution URLs and activation.
 *
 * Uploads are used immediately (no pre-publication review). Moderators can
 * still reject a texture after the fact if it violates the rules.
 */
@Injectable()
export class TextureService {
  constructor(
    private readonly config: AppConfigService,
    private readonly db: DbService,
    private readonly quota: UploadQuotaService,
    private readonly progress: ProgressService,
  ) {}
  /** GameProfile with the active skin/cape encoded as a `textures` property. */
  async buildGameProfile(player: PlayerRow): Promise<GameProfile> {
    const active = await this.activeTexturesFor([player.uuid]);
    const capeUnlocked = await this.progress.capeUnlocked(player.userId);
    return this.composeGameProfile(player, active, capeUnlocked);
  }
  /**
   * Batch variant: one query for every active texture plus one for cape
   * unlocks, instead of two queries per player.
   */
  async buildGameProfiles(players: PlayerRow[]): Promise<GameProfile[]> {
    if (players.length === 0) {
      return [];
    }
    const active = await this.activeTexturesFor(players.map((player) => player.uuid));
    const unlocked = await this.progress.capeUnlockedFor(players.map((player) => player.userId));
    return players.map((player) =>
      this.composeGameProfile(
        player,
        active.filter((row) => row.playerUuid === player.uuid),
        unlocked.has(player.userId),
      ),
    );
  }
  private async activeTexturesFor(playerUuids: string[]): Promise<SkinRow[]> {
    const unique = [...new Set(playerUuids)];
    if (unique.length === 0) {
      return [];
    }
    return await this.db.db
      .select()
      .from(skinTable)
      .where(
        and(
          inArray(skinTable.playerUuid, unique),
          eq(skinTable.status, 'approved'),
          eq(skinTable.isActive, true),
        ),
      );
  }
  private composeGameProfile(
    player: PlayerRow,
    active: SkinRow[],
    capeUnlocked: boolean,
  ): GameProfile {
    const profile: GameProfile = { id: player.uuid, name: player.nickname };
    const textures: Record<string, unknown> = {};
    const skin = active.find((row) => row.kind === 'skin');
    if (skin) {
      textures.SKIN = {
        url: this.signTextureUrl(skin.id),
        ...(skin.variant === 'slim' ? { metadata: { model: 'slim' } } : {}),
      };
    }
    const cape = active.find((row) => row.kind === 'cape');
    if (cape && capeUnlocked) {
      textures.CAPE = { url: this.signTextureUrl(cape.id) };
    }
    if (Object.keys(textures).length > 0) {
      const payload = {
        timestamp: Date.now(),
        profileId: player.uuid,
        profileName: player.nickname,
        textures,
      };
      profile.properties = [
        {
          name: 'textures',
          value: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'),
        },
      ];
    }
    return profile;
  }
  /** All approved textures for the player, newest first (MinecraftProfileResponse). */
  async getTextures(player: PlayerRow): Promise<MinecraftProfileResponse> {
    const rows = await this.db.db
      .select()
      .from(skinTable)
      .where(and(eq(skinTable.playerUuid, player.uuid), eq(skinTable.status, 'approved')))
      .orderBy(desc(skinTable.uploadedAt));
    const capeUnlocked = await this.progress.capeUnlocked(player.userId);
    return {
      id: player.uuid,
      name: player.nickname,
      skins: rows
        .filter((row) => row.kind === 'skin')
        .map((row) => ({
          id: String(row.id),
          state: row.isActive ? 'ACTIVE' : 'INACTIVE',
          url: this.signTextureUrl(row.id),
          variant: row.variant === 'slim' ? 'SLIM' : 'CLASSIC',
        })),
      capes: rows
        .filter((row) => row.kind === 'cape' && capeUnlocked)
        .map((row) => ({
          id: String(row.id),
          state: row.isActive ? 'ACTIVE' : 'INACTIVE',
          url: this.signTextureUrl(row.id),
        })),
    };
  }
  async upload(
    player: PlayerRow,
    kind: SkinKind,
    file: Express.Multer.File | undefined,
    variant: SkinVariant | undefined,
  ): Promise<TextureUploadResponse> {
    const buffer = file?.buffer;
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('缺少纹理文件（multipart 字段 file）');
    }
    if (kind === 'cape') {
      await this.progress.assertCapeUnlocked(player.userId);
    }
    if (buffer.length > MAX_TEXTURE_BYTES) {
      throw new BadRequestException(`纹理文件不得超过 ${MAX_TEXTURE_BYTES / 1024} KiB`);
    }
    await this.assertValidPng(buffer, kind);
    await this.quota.consume(player.userId, 'texture', MAX_TEXTURE_UPLOADS_PER_DAY);
    try {
      const effectiveVariant: SkinVariant | null = kind === 'skin' ? (variant ?? 'classic') : null;
      const digest = createHash('sha256').update(buffer).digest('hex');
      const relativePath = path.posix.join('textures', kind, `${digest}.png`);
      await this.writeTextureFile(relativePath, buffer);
      const existing = (
        await this.db.db
          .select()
          .from(skinTable)
          .where(
            and(
              eq(skinTable.playerUuid, player.uuid),
              eq(skinTable.kind, kind),
              eq(skinTable.sha256, digest),
            ),
          )
      )[0];
      if (existing) {
        await this.db.transaction(async (tx) => {
          await tx
            .update(skinTable)
            .set({ isActive: false, activeSlot: null })
            .where(
              and(
                eq(skinTable.playerUuid, player.uuid),
                eq(skinTable.kind, kind),
                eq(skinTable.isActive, true),
              ),
            );
          await tx
            .update(skinTable)
            .set({
              status: 'approved',
              variant: effectiveVariant,
              isActive: true,
              activeSlot: activeSlotOf(player.uuid, kind),
              uploadedAt: new Date(),
              reviewedBy: null,
            })
            .where(eq(skinTable.id, existing.id));
        });
        return this.toUploadResponse(await this.getSkinRow(existing.id));
      }
      const inserted = await this.db.transaction(async (tx) => {
        await tx
          .update(skinTable)
          .set({ isActive: false, activeSlot: null })
          .where(
            and(
              eq(skinTable.playerUuid, player.uuid),
              eq(skinTable.kind, kind),
              eq(skinTable.isActive, true),
            ),
          );
        return firstOrThrow(
          await this.db.insertReturning(
            skinTable,
            {
              playerUuid: player.uuid,
              kind,
              variant: effectiveVariant,
              filePath: relativePath,
              sha256: digest,
              status: 'approved',
              isActive: true,
              activeSlot: activeSlotOf(player.uuid, kind),
            },
            tx,
          ),
        );
      });
      return this.toUploadResponse(inserted);
    } catch (error) {
      // Persisting failed: give the daily quota slot back instead of silently
      // burning it on an upload the user never received.
      await this.quota.release(player.userId, 'texture').catch(() => undefined);
      throw error;
    }
  }
  /** Removes one of the player's textures; an active texture falls back to default. */
  async delete(player: PlayerRow, id: number): Promise<DeleteTextureResponse> {
    const row = await this.getSkinRow(id);
    if (row.playerUuid !== player.uuid) {
      throw new NotFoundException('纹理不存在');
    }
    await this.db.db.delete(skinTable).where(eq(skinTable.id, id));
    return { deleted: true };
  }
  async listForReview(
    status?: SkinStatus,
    kind?: SkinKind,
    page = 1,
    pageSize = 20,
  ): Promise<Paginated<TextureReviewView>> {
    const safePage = Math.max(1, page);
    const safeSize = Math.min(50, Math.max(1, pageSize));
    const conditions = [];
    if (status !== undefined) {
      conditions.push(eq(skinTable.status, status));
    }
    if (kind !== undefined) {
      conditions.push(eq(skinTable.kind, kind));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await this.db.db
      .select({ skin: skinTable, nickname: playerTable.nickname })
      .from(skinTable)
      .innerJoin(playerTable, eq(skinTable.playerUuid, playerTable.uuid))
      .where(where)
      .orderBy(desc(skinTable.uploadedAt), desc(skinTable.id))
      .limit(safeSize)
      .offset((safePage - 1) * safeSize);
    const total = (await this.db.db.select({ value: count() }).from(skinTable).where(where))[0];
    return {
      items: rows.map(({ skin, nickname }) => ({
        id: skin.id,
        playerUuid: skin.playerUuid,
        nickname,
        kind: skin.kind,
        variant: skin.variant,
        status: skin.status,
        isActive: skin.isActive,
        uploadedAt: skin.uploadedAt,
        url: this.signTextureUrl(skin.id),
      })),
      total: total?.value ?? 0,
      page: safePage,
      pageSize: safeSize,
    };
  }
  /** Switches the active texture among the player's approved uploads. */
  async activate(player: PlayerRow, id: number): Promise<ActivateTextureResponse> {
    const row = await this.getSkinRow(id);
    if (row.playerUuid !== player.uuid) {
      throw new NotFoundException('纹理不存在');
    }
    if (row.status !== 'approved') {
      throw new BadRequestException('该纹理已下架，无法设为当前');
    }
    if (row.kind === 'cape') {
      await this.progress.assertCapeUnlocked(player.userId);
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(skinTable)
        .set({ isActive: false, activeSlot: null })
        .where(
          and(
            eq(skinTable.playerUuid, player.uuid),
            eq(skinTable.kind, row.kind),
            eq(skinTable.isActive, true),
          ),
        );
      await tx
        .update(skinTable)
        .set({ isActive: true, activeSlot: activeSlotOf(player.uuid, row.kind) })
        .where(eq(skinTable.id, id));
    });
    return { id: row.id, kind: row.kind, active: true };
  }
  async approve(id: number, actorId: string, reason?: string): Promise<TextureReviewView> {
    const row = await this.getSkinRow(id);
    if (!row) {
      throw new NotFoundException('纹理不存在');
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(skinTable)
        .set({ isActive: false, activeSlot: null })
        .where(
          and(
            eq(skinTable.playerUuid, row.playerUuid),
            eq(skinTable.kind, row.kind),
            eq(skinTable.isActive, true),
          ),
        );
      await tx
        .update(skinTable)
        .set({
          status: 'approved',
          isActive: true,
          activeSlot: activeSlotOf(row.playerUuid, row.kind),
          reviewedBy: actorId,
        })
        .where(eq(skinTable.id, id));
      await tx.insert(moderationLog).values({
        actorId,
        action: 'approve_skin',
        targetType: 'skin',
        targetId: String(id),
        reason: reason ?? null,
      });
    });
    return await this.toReviewView(await this.getSkinRow(id));
  }
  async reject(id: number, actorId: string, reason?: string): Promise<TextureReviewView> {
    const row = await this.getSkinRow(id);
    if (!row) {
      throw new NotFoundException('纹理不存在');
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(skinTable)
        .set({ status: 'rejected', isActive: false, activeSlot: null, reviewedBy: actorId })
        .where(eq(skinTable.id, id));
      await tx.insert(moderationLog).values({
        actorId,
        action: 'reject_skin',
        targetType: 'skin',
        targetId: String(id),
        reason: reason ?? null,
      });
    });
    return await this.toReviewView(await this.getSkinRow(id));
  }
  /**
   * Verifies a signed URL and returns the image bytes. The signature is the
   * authorization: rejected textures are still reachable through an existing
   * signed URL until it expires, so takedowns take effect on the next profile
   * fetch.
   */
  async readSignedTexture(
    id: number,
    expires: string | undefined,
    signature: string | undefined,
  ): Promise<Buffer> {
    const expiresAt = Number(expires);
    if (
      !Number.isInteger(expiresAt) ||
      expiresAt <= Math.floor(Date.now() / 1000) ||
      signature === undefined ||
      signature === ''
    ) {
      throw new ForbiddenException('纹理链接无效或已过期');
    }
    const expected = Buffer.from(this.signatureFor(id, expiresAt));
    const actual = Buffer.from(signature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new ForbiddenException('纹理链接无效或已过期');
    }
    const row = await this.getSkinRow(id);
    if (!row) {
      throw new NotFoundException('纹理不存在');
    }
    const absolutePath = this.absoluteTexturePath(row.filePath);
    try {
      return await fs.readFile(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException('纹理文件不存在');
      }
      throw error;
    }
  }
  private async assertValidPng(buffer: Buffer, kind: SkinKind): Promise<void> {
    let metadata: Metadata;
    try {
      metadata = await sharp(buffer, { failOn: 'error', limitInputPixels: 1000000 }).metadata();
    } catch {
      throw new BadRequestException('无法解析纹理文件，必须为有效的 PNG');
    }
    if (metadata.format !== 'png') {
      throw new BadRequestException('纹理文件必须为 PNG');
    }
    if (metadata.pages !== undefined && metadata.pages > 1) {
      throw new BadRequestException('不支持动画 PNG');
    }
    const dimensions = `${metadata.width ?? 0}x${metadata.height ?? 0}`;
    if (!ALLOWED_DIMENSIONS[kind].includes(dimensions)) {
      const expected = kind === 'skin' ? '64×32 或 64×64' : '64×32';
      throw new BadRequestException(
        `${kind === 'skin' ? '皮肤' : '披风'}尺寸必须为原版 ${expected}（不支持高清纹理）`,
      );
    }
  }
  private async writeTextureFile(relativePath: string, buffer: Buffer): Promise<void> {
    const absolutePath = this.absoluteTexturePath(relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    try {
      await fs.writeFile(absolutePath, buffer, { flag: 'wx' });
    } catch (error) {
      // Content-addressed: an existing file already holds the same bytes. This
      // also makes two concurrent uploads of the same PNG harmless.
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }
  private absoluteTexturePath(filePath: string): string {
    const root = path.resolve(this.config.uploadDir);
    const absolutePath = path.resolve(root, filePath);
    if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) {
      throw new ForbiddenException('纹理路径不合法');
    }
    return absolutePath;
  }
  private async getSkinRow(id: number): Promise<SkinRow> {
    const row = (await this.db.db.select().from(skinTable).where(eq(skinTable.id, id)))[0];
    if (!row) {
      throw new NotFoundException('纹理不存在');
    }
    return row;
  }
  private signTextureUrl(id: number): string {
    const expires = Math.floor(Date.now() / 1000) + this.config.textureUrlTtlSeconds;
    const signature = this.signatureFor(id, expires);
    return `${this.config.authUrl.replace(/\/+$/, '')}/api/minecraft/profile/textures/${id}?expires=${expires}&sig=${signature}`;
  }
  private signatureFor(id: number, expires: number): string {
    return createHmac('sha256', this.config.betterAuthSecret)
      .update(`texture:${id}:${expires}`)
      .digest('base64url');
  }
  private toUploadResponse(row: SkinRow): TextureUploadResponse {
    return {
      id: row.id,
      kind: row.kind,
      variant: row.variant,
      status: row.status,
      uploadedAt: row.uploadedAt.toISOString(),
      url: this.signTextureUrl(row.id),
    };
  }
  private async toReviewView(row: SkinRow): Promise<TextureReviewView> {
    const nickname = (
      await this.db.db
        .select({ nickname: playerTable.nickname })
        .from(playerTable)
        .where(eq(playerTable.uuid, row.playerUuid))
    )[0];
    return {
      id: row.id,
      playerUuid: row.playerUuid,
      nickname: nickname?.nickname ?? '',
      kind: row.kind,
      variant: row.variant,
      status: row.status,
      isActive: row.isActive,
      uploadedAt: row.uploadedAt,
      url: this.signTextureUrl(row.id),
    };
  }
}
