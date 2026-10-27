import { Injectable, type OnModuleInit } from '@nestjs/common';
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
  constructor(private readonly db: DbService) {}

  onModuleInit(): void {
    this.backfill();
  }

  /** A reservation owned by another player and still active blocks the name. */
  isReservedByOther(nickname: string, playerUuid: string | null): boolean {
    const row = this.db.db
      .select()
      .from(nicknameReservation)
      .where(
        and(
          eq(nicknameReservation.nickname, nickname),
          gt(nicknameReservation.reservedUntil, new Date()),
        ),
      )
      .get();
    if (!row) {
      return false;
    }
    return playerUuid === null || row.playerUuid !== playerUuid;
  }

  private backfill(): void {
    const activeFrom = new Date(Date.now() - RESERVATION_MS);
    const rows = this.db.db
      .select()
      .from(player)
      .where(and(isNotNull(player.nameCooldownAt), gt(player.nameCooldownAt, activeFrom)))
      .all();

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
        this.db.db
          .insert(nicknameReservation)
          .values({ nickname, playerUuid: row.uuid, reservedUntil })
          .onConflictDoNothing()
          .run();
      }
    }
  }
}
