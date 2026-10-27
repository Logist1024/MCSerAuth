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
  type SkinKind,
  type SkinStatus,
  type SkinVariant,
  type TextureUploadResponse,
} from '@mcserauth/shared';
import { and, desc, eq } from 'drizzle-orm';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp, { type Metadata } from 'sharp';
import { AppConfigService } from '../../config/app-config.service.js';
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
  buildGameProfile(player: PlayerRow): GameProfile {
    const profile: GameProfile = { id: player.uuid, name: player.nickname };
    const active = this.db.db
      .select()
      .from(skinTable)
      .where(
        and(
          eq(skinTable.playerUuid, player.uuid),
          eq(skinTable.status, 'approved'),
          eq(skinTable.isActive, true),
        ),
      )
      .all();

    const textures: Record<string, unknown> = {};
    const skin = active.find((row) => row.kind === 'skin');
    if (skin) {
      textures.SKIN = {
        url: this.signTextureUrl(skin.id),
        ...(skin.variant === 'slim' ? { metadata: { model: 'slim' } } : {}),
      };
    }
    const cape = active.find((row) => row.kind === 'cape');
    if (cape && this.progress.capeUnlocked(player.userId)) {
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
  getTextures(player: PlayerRow): MinecraftProfileResponse {
    const rows = this.db.db
      .select()
      .from(skinTable)
      .where(and(eq(skinTable.playerUuid, player.uuid), eq(skinTable.status, 'approved')))
      .orderBy(desc(skinTable.uploadedAt))
      .all();

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
        .filter((row) => row.kind === 'cape' && this.progress.capeUnlocked(player.userId))
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
      this.progress.assertCapeUnlocked(player.userId);
    }
    if (buffer.length > MAX_TEXTURE_BYTES) {
      throw new BadRequestException(`纹理文件不得超过 ${MAX_TEXTURE_BYTES / 1024} KiB`);
    }

    await this.assertValidPng(buffer, kind);
    this.quota.consume(player.userId, 'texture', MAX_TEXTURE_UPLOADS_PER_DAY);

    const effectiveVariant: SkinVariant | null = kind === 'skin' ? (variant ?? 'classic') : null;
    const digest = createHash('sha256').update(buffer).digest('hex');
    const relativePath = path.posix.join('textures', kind, `${digest}.png`);
    this.writeTextureFile(relativePath, buffer);

    const existing = this.db.db
      .select()
      .from(skinTable)
      .where(
        and(
          eq(skinTable.playerUuid, player.uuid),
          eq(skinTable.kind, kind),
          eq(skinTable.sha256, digest),
        ),
      )
      .get();

    if (existing) {
      this.db.db.transaction((tx) => {
        tx.update(skinTable)
          .set({ isActive: false })
          .where(
            and(
              eq(skinTable.playerUuid, player.uuid),
              eq(skinTable.kind, kind),
              eq(skinTable.isActive, true),
            ),
          )
          .run();
        tx.update(skinTable)
          .set({
            status: 'approved',
            variant: effectiveVariant,
            isActive: true,
            uploadedAt: new Date(),
            reviewedBy: null,
          })
          .where(eq(skinTable.id, existing.id))
          .run();
      });
      return this.toUploadResponse(this.getSkinRow(existing.id));
    }

    const inserted = this.db.db.transaction((tx) => {
      tx.update(skinTable)
        .set({ isActive: false })
        .where(
          and(
            eq(skinTable.playerUuid, player.uuid),
            eq(skinTable.kind, kind),
            eq(skinTable.isActive, true),
          ),
        )
        .run();
      return tx
        .insert(skinTable)
        .values({
          playerUuid: player.uuid,
          kind,
          variant: effectiveVariant,
          filePath: relativePath,
          sha256: digest,
          status: 'approved',
          isActive: true,
        })
        .returning()
        .get();
    });

    return this.toUploadResponse(inserted);
  }

  /** Removes one of the player's textures; an active texture falls back to default. */
  delete(player: PlayerRow, id: number): DeleteTextureResponse {
    const row = this.getSkinRow(id);
    if (row.playerUuid !== player.uuid) {
      throw new NotFoundException('纹理不存在');
    }
    this.db.db.delete(skinTable).where(eq(skinTable.id, id)).run();
    return { deleted: true };
  }

  listForReview(status?: SkinStatus, kind?: SkinKind): TextureReviewView[] {
    const conditions = [];
    if (status !== undefined) {
      conditions.push(eq(skinTable.status, status));
    }
    if (kind !== undefined) {
      conditions.push(eq(skinTable.kind, kind));
    }

    const rows = this.db.db
      .select({ skin: skinTable, nickname: playerTable.nickname })
      .from(skinTable)
      .innerJoin(playerTable, eq(skinTable.playerUuid, playerTable.uuid))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(skinTable.uploadedAt))
      .all();

    return rows.map(({ skin, nickname }) => ({
      id: skin.id,
      playerUuid: skin.playerUuid,
      nickname,
      kind: skin.kind,
      variant: skin.variant,
      status: skin.status,
      isActive: skin.isActive,
      uploadedAt: skin.uploadedAt,
      url: this.signTextureUrl(skin.id),
    }));
  }

  /** Switches the active texture among the player's approved uploads. */
  activate(player: PlayerRow, id: number): ActivateTextureResponse {
    const row = this.getSkinRow(id);
    if (row.playerUuid !== player.uuid) {
      throw new NotFoundException('纹理不存在');
    }
    if (row.status !== 'approved') {
      throw new BadRequestException('该纹理已下架，无法设为当前');
    }
    if (row.kind === 'cape') {
      this.progress.assertCapeUnlocked(player.userId);
    }

    this.db.db.transaction((tx) => {
      tx.update(skinTable)
        .set({ isActive: false })
        .where(
          and(
            eq(skinTable.playerUuid, player.uuid),
            eq(skinTable.kind, row.kind),
            eq(skinTable.isActive, true),
          ),
        )
        .run();
      tx.update(skinTable).set({ isActive: true }).where(eq(skinTable.id, id)).run();
    });

    return { id: row.id, kind: row.kind, active: true };
  }

  approve(id: number, actorId: string, reason?: string): TextureReviewView {
    const row = this.getSkinRow(id);
    if (!row) {
      throw new NotFoundException('纹理不存在');
    }

    this.db.db.transaction((tx) => {
      tx.update(skinTable)
        .set({ isActive: false })
        .where(
          and(
            eq(skinTable.playerUuid, row.playerUuid),
            eq(skinTable.kind, row.kind),
            eq(skinTable.isActive, true),
          ),
        )
        .run();
      tx.update(skinTable)
        .set({ status: 'approved', isActive: true, reviewedBy: actorId })
        .where(eq(skinTable.id, id))
        .run();
      tx.insert(moderationLog)
        .values({
          actorId,
          action: 'approve_skin',
          targetType: 'skin',
          targetId: String(id),
          reason: reason ?? null,
        })
        .run();
    });

    return this.toReviewView(this.getSkinRow(id));
  }

  reject(id: number, actorId: string, reason?: string): TextureReviewView {
    const row = this.getSkinRow(id);
    if (!row) {
      throw new NotFoundException('纹理不存在');
    }

    this.db.db.transaction((tx) => {
      tx.update(skinTable)
        .set({ status: 'rejected', isActive: false, reviewedBy: actorId })
        .where(eq(skinTable.id, id))
        .run();
      tx.insert(moderationLog)
        .values({
          actorId,
          action: 'reject_skin',
          targetType: 'skin',
          targetId: String(id),
          reason: reason ?? null,
        })
        .run();
    });

    return this.toReviewView(this.getSkinRow(id));
  }

  /**
   * Verifies a signed URL and returns the image bytes. The signature is the
   * authorization: rejected textures are still reachable through an existing
   * signed URL until it expires, so takedowns take effect on the next profile
   * fetch.
   */
  readSignedTexture(
    id: number,
    expires: string | undefined,
    signature: string | undefined,
  ): Buffer {
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

    const row = this.getSkinRow(id);
    if (!row) {
      throw new NotFoundException('纹理不存在');
    }

    const absolutePath = this.absoluteTexturePath(row.filePath);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('纹理文件不存在');
    }
    return fs.readFileSync(absolutePath);
  }

  private async assertValidPng(buffer: Buffer, kind: SkinKind): Promise<void> {
    let metadata: Metadata;
    try {
      metadata = await sharp(buffer, { failOn: 'error', limitInputPixels: 1_000_000 }).metadata();
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

  private writeTextureFile(relativePath: string, buffer: Buffer): void {
    const absolutePath = this.absoluteTexturePath(relativePath);
    if (fs.existsSync(absolutePath)) {
      return;
    }
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, buffer, { flag: 'wx' });
  }

  private absoluteTexturePath(filePath: string): string {
    const root = path.resolve(this.config.uploadDir);
    const absolutePath = path.resolve(root, filePath);
    if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) {
      throw new ForbiddenException('纹理路径不合法');
    }
    return absolutePath;
  }

  private getSkinRow(id: number): SkinRow {
    const row = this.db.db.select().from(skinTable).where(eq(skinTable.id, id)).get();
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

  private toReviewView(row: SkinRow): TextureReviewView {
    const nickname = this.db.db
      .select({ nickname: playerTable.nickname })
      .from(playerTable)
      .where(eq(playerTable.uuid, row.playerUuid))
      .get();

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
