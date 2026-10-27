import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { player } from './player.js';

/**
 * Old nickname reservations (30-day cool-down).
 *
 * A rename inserts the previous nickname here with `reserved_until = now + 30d`.
 * Reservations belonging to the same player never block them; other players
 * cannot take a still-reserved name.
 */
export const nicknameReservation = sqliteTable(
  'nickname_reservation',
  {
    nickname: text('nickname').primaryKey(),
    playerUuid: text('player_uuid')
      .notNull()
      .references(() => player.uuid, { onDelete: 'cascade' }),
    reservedUntil: integer('reserved_until', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('nickname_reservation_player_uuid_idx').on(t.playerUuid),
    index('nickname_reservation_reserved_until_idx').on(t.reservedUntil),
  ],
);
