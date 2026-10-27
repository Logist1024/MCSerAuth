import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { firstOrThrow } from '../../common/helpers/rows.js';
import { DbService } from '../../db/db.service.js';
import { serverEntry } from '../../db/schema/index.js';
import { sha256 } from '../auth/oauth.util.js';
import type { CreateServerDto, ServerEntryDto, UpdateServerDto } from './dto/admin.dto.js';

type ServerRow = typeof serverEntry.$inferSelect;

/** Server allow-list management (admin only). Secrets are stored hashed. */
@Injectable()
export class AdminServersService {
  constructor(private readonly db: DbService) {}

  async list(): Promise<ServerEntryDto[]> {
    return (await this.db.db.select().from(serverEntry).orderBy(desc(serverEntry.createdAt))).map(
      (row) => this.toDto(row),
    );
  }

  async create(input: CreateServerDto): Promise<ServerEntryDto> {
    const existing = (
      await this.db.db
        .select({ id: serverEntry.id })
        .from(serverEntry)
        .where(eq(serverEntry.serverId, input.serverId))
    )[0];
    if (existing) {
      throw new ConflictException('serverId 已存在');
    }

    const plaintextSecret = input.secret ?? randomBytes(24).toString('base64url');
    const inserted = firstOrThrow(
      await this.db.insertReturning(serverEntry, {
        serverId: input.serverId,
        name: input.name.trim(),
        secret: sha256(plaintextSecret),
        enabled: true,
      }),
    );

    // The plaintext is revealed exactly once; only the hash is persisted.
    return { ...this.toDto(inserted), secret: plaintextSecret };
  }

  async update(id: number, input: UpdateServerDto): Promise<ServerEntryDto> {
    if (input.name === undefined && input.enabled === undefined) {
      throw new BadRequestException('至少提供 name 或 enabled');
    }

    const existing = (await this.db.db.select().from(serverEntry).where(eq(serverEntry.id, id)))[0];
    if (!existing) {
      throw new NotFoundException('服务器不存在');
    }

    const updated = firstOrThrow(
      await this.db.updateReturning(
        serverEntry,
        {
          ...(input.name === undefined ? {} : { name: input.name.trim() }),
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        },
        eq(serverEntry.id, id),
      ),
    );

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
