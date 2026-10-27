import { Injectable } from '@nestjs/common';
import type { GameProfile } from '@mcserauth/shared';
import { eq, inArray } from 'drizzle-orm';
import { DbService } from '../../db/db.service.js';
import { player as playerTable } from '../../db/schema/index.js';
import { TextureService } from './texture.service.js';
/** Read-only GameProfile lookups used by launchers and server mods. */
@Injectable()
export class ProfilesService {
  constructor(
    private readonly db: DbService,
    private readonly textures: TextureService,
  ) {}
  async getByName(name: string): Promise<GameProfile | null> {
    const row = (
      await this.db.db.select().from(playerTable).where(eq(playerTable.nickname, name))
    )[0];
    return row ? await this.textures.buildGameProfile(row) : null;
  }
  async getByUuid(uuid: string): Promise<GameProfile | null> {
    const row = (await this.db.db.select().from(playerTable).where(eq(playerTable.uuid, uuid)))[0];
    return row ? await this.textures.buildGameProfile(row) : null;
  }
  /** Batch lookup; keeps the requested order and skips unknown names. */
  async getBatch(names: string[]): Promise<GameProfile[]> {
    const requested = [...new Set(names.map((name) => name.trim()).filter((name) => name !== ''))];
    if (requested.length === 0) {
      return [];
    }
    const rows = await this.db.db
      .select()
      .from(playerTable)
      .where(inArray(playerTable.nickname, requested));
    const byName = new Map(rows.map((row) => [row.nickname, row]));
    const profiles = await Promise.all(
      requested.map(async (name) => {
        const row = byName.get(name);
        return row ? [await this.textures.buildGameProfile(row)] : [];
      }),
    );
    return profiles.flat();
  }
}
