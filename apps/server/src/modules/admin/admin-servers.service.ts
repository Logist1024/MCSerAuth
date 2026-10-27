import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { DbService } from '../../db/db.service.js';
import { serverEntry } from '../../db/schema/index.js';
import { sha256 } from '../auth/oauth.util.js';
import type { CreateServerDto, ServerEntryDto, UpdateServerDto } from './dto/admin.dto.js';

type ServerRow = typeof serverEntry.$inferSelect;

/** Server allow-list management (admin only). Secrets are stored hashed. */
@Injectable()
export class AdminServersService {
  constructor(private readonly db: DbService) {}

  list(): ServerEntryDto[] {
    return this.db.db
      .select()
      .from(serverEntry)
      .orderBy(desc(serverEntry.createdAt))
      .all()
      .map((row) => this.toDto(row));
  }

  create(input: CreateServerDto): ServerEntryDto {
    const existing = this.db.db
      .select({ id: serverEntry.id })
      .from(serverEntry)
      .where(eq(serverEntry.serverId, input.serverId))
      .get();
    if (existing) {
      throw new ConflictException('serverId 已存在');
    }

    const plaintextSecret = input.secret ?? randomBytes(24).toString('base64url');
    const inserted = this.db.db
      .insert(serverEntry)
      .values({
        serverId: input.serverId,
        name: input.name.trim(),
        secret: sha256(plaintextSecret),
        enabled: true,
      })
      .returning()
      .get();

    // The plaintext is revealed exactly once; only the hash is persisted.
    return { ...this.toDto(inserted), secret: plaintextSecret };
  }

  update(id: number, input: UpdateServerDto): ServerEntryDto {
    if (input.name === undefined && input.enabled === undefined) {
      throw new BadRequestException('至少提供 name 或 enabled');
    }

    const existing = this.db.db.select().from(serverEntry).where(eq(serverEntry.id, id)).get();
    if (!existing) {
      throw new NotFoundException('服务器不存在');
    }

    const updated = this.db.db
      .update(serverEntry)
      .set({
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      })
      .where(eq(serverEntry.id, id))
      .returning()
      .get();

    return this.toDto(updated);
  }

  private toDto(row: ServerRow): ServerEntryDto {
    return {
      id: row.id,
      serverId: row.serverId,
      name: row.name,
      enabled: row.enabled,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
