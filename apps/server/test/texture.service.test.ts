import { BadRequestException, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { UploadQuotaService } from '../src/common/services/upload-quota.service.js';
import { TextureService } from '../src/modules/profiles/texture.service.js';
import { ProgressService } from '../src/modules/growth/progress.service.js';
import { player, user } from '../src/db/schema/index.js';
import { createTestContext, type TestContext } from './helpers/db.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const PLAYER_UUID = 'c'.repeat(32);
const OTHER_PLAYER_UUID = 'd'.repeat(32);

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

describe('TextureService', () => {
  let ctx: TestContext;
  let textures: TextureService;

  beforeEach(() => {
    ctx = createTestContext();
    ctx.db.db
      .insert(user)
      .values([
        { id: 'u1', email: 'u1@example.com', name: 'User One' },
        { id: 'u2', email: 'u2@example.com', name: 'User Two' },
        { id: 'admin1', email: 'admin@example.com', name: 'Admin', role: 'admin' },
      ])
      .run();
    ctx.db.db
      .insert(player)
      .values([
        { uuid: PLAYER_UUID, userId: 'u1', nickname: 'PlayerOne' },
        { uuid: OTHER_PLAYER_UUID, userId: 'u2', nickname: 'PlayerTwo' },
      ])
      .run();
    textures = new TextureService(
      ctx.config,
      ctx.db,
      new UploadQuotaService(ctx.db),
      new ProgressService(ctx.db),
    );
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('activates uploads immediately and removes them again', async () => {
    const playerRow = ctx.db.db.select().from(player).where(eq(player.uuid, PLAYER_UUID)).get();
    if (playerRow === undefined) {
      throw new Error('missing player');
    }

    const upload = await textures.upload(
      playerRow,
      'skin',
      { buffer: await png(64, 64) } as Express.Multer.File,
      'slim',
    );
    expect(upload.status).toBe('approved');
    expect(upload.url).toContain('/api/minecraft/profile/textures/');

    const published = textures.getTextures(playerRow);
    expect(published.skins).toHaveLength(1);
    expect(published.skins[0]).toMatchObject({ state: 'ACTIVE', variant: 'SLIM' });

    const profile = textures.buildGameProfile(playerRow);
    expect(profile.properties?.[0]?.name).toBe('textures');
    expect(profile.properties?.[0]?.value.length).toBeGreaterThan(10);

    expect(textures.delete(playerRow, upload.id)).toEqual({ deleted: true });
    expect(textures.getTextures(playerRow).skins).toHaveLength(0);
    expect(textures.buildGameProfile(playerRow).properties).toBeUndefined();
  });

  it("does not let a player activate or delete another player's texture", async () => {
    const mine = ctx.db.db.select().from(player).where(eq(player.uuid, PLAYER_UUID)).get();
    const other = ctx.db.db.select().from(player).where(eq(player.uuid, OTHER_PLAYER_UUID)).get();
    if (mine === undefined || other === undefined) {
      throw new Error('missing player');
    }

    const upload = await textures.upload(
      other,
      'skin',
      { buffer: await png(64, 64) } as Express.Multer.File,
      'classic',
    );

    expect(() => textures.activate(mine, upload.id)).toThrow(NotFoundException);
    expect(() => textures.delete(mine, upload.id)).toThrow(NotFoundException);
    expect(textures.getTextures(mine).skins).toHaveLength(0);
    expect(textures.getTextures(other).skins).toHaveLength(1);
  });

  it('rejects textures with invalid dimensions', async () => {
    const playerRow = ctx.db.db.select().from(player).where(eq(player.uuid, PLAYER_UUID)).get();
    if (playerRow === undefined) {
      throw new Error('missing player');
    }

    await expect(
      textures.upload(
        playerRow,
        'skin',
        { buffer: await png(32, 32) } as Express.Multer.File,
        'classic',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces the daily quota counter', () => {
    const quota = new UploadQuotaService(ctx.db);
    quota.consume('u1', 'texture', 2);
    quota.consume('u1', 'texture', 2);
    expect(() => quota.consume('u1', 'texture', 2)).toThrow(/上限/);
  });
});
