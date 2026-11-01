import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { and, eq, gt, isNotNull } from 'drizzle-orm';
import { DbService } from '../../db/db.service.js';
import { nicknameReservation, player } from '../../db/schema/index.js';
export const RESERVATION_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * 30-day nickname reservations.
 *
 * Runtime renames insert an exact reservation for the old name. The startup
 * backfill is best-effort for pre-existing rows: only the last rename time is
 * known, so every historical name is reserved until that time + 30 days.
 */
@Injectable()
export class NicknameReservationService implements OnModuleInit {
  private readonly logger = new Logger(NicknameReservationService.name);
  constructor(private readonly db: DbService) {}
  async onModuleInit(): Promise<void> {
    // Best-effort in earnest: a database that is still starting up (or briefly
    // unreachable) must not crash-loop the whole process — /health/ready is
    // the signal operators watch, not a boot exception.
    try {
      await this.backfill();
    } catch (error: unknown) {
      this.logger.warn(
        `Nickname reservation backfill failed; will rely on runtime renames until next boot: ${String(error)}`,
      );
    }
  }
  /** A reservation owned by another player and still active blocks the name. */
  async isReservedByOther(nickname: string, playerUuid: string | null): Promise<boolean> {
    const row = (
      await this.db.db
        .select()
        .from(nicknameReservation)
        .where(
          and(
            eq(nicknameReservation.nickname, nickname),
            gt(nicknameReservation.reservedUntil, new Date()),
          ),
        )
    )[0];
    if (!row) {
      return false;
    }
    return playerUuid === null || row.playerUuid !== playerUuid;
  }
  private async backfill(): Promise<void> {
    const activeFrom = new Date(Date.now() - RESERVATION_MS);
    const rows = await this.db.db
      .select()
      .from(player)
      .where(and(isNotNull(player.nameCooldownAt), gt(player.nameCooldownAt, activeFrom)));
    for (const row of rows) {
      if (row.nameCooldownAt === null) {
        continue;
      }
      const reservedUntil = new Date(row.nameCooldownAt.getTime() + RESERVATION_MS);
      const names = new Set(row.nicknameHistory);
      if (row.previousNickname !== null) {
        names.add(row.previousNickname);
      }
      names.delete(row.nickname);
      for (const nickname of names) {
        await this.db.insertIgnore(nicknameReservation, {
          nickname,
          playerUuid: row.uuid,
          reservedUntil,
        });
      }
    }
  }
}
