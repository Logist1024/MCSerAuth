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

  getByName(name: string): GameProfile | null {
    const row = this.db.db.select().from(playerTable).where(eq(playerTable.nickname, name)).get();
    return row ? this.textures.buildGameProfile(row) : null;
  }

  getByUuid(uuid: string): GameProfile | null {
    const row = this.db.db.select().from(playerTable).where(eq(playerTable.uuid, uuid)).get();
    return row ? this.textures.buildGameProfile(row) : null;
  }

  /** Batch lookup; keeps the requested order and skips unknown names. */
  getBatch(names: string[]): GameProfile[] {
    const requested = [...new Set(names.map((name) => name.trim()).filter((name) => name !== ''))];
    if (requested.length === 0) {
      return [];
    }

    const rows = this.db.db
      .select()
      .from(playerTable)
      .where(inArray(playerTable.nickname, requested))
      .all();
    const byName = new Map(rows.map((row) => [row.nickname, row]));

    return requested.flatMap((name) => {
      const row = byName.get(name);
      return row ? [this.textures.buildGameProfile(row)] : [];
    });
  }
}
