import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { player } from './player.js';

/**
 * Short-lived joinServer registrations consumed by hasJoined.
 *
 * One row per (player, server) is kept: a repeated join overwrites the previous
 * registration. Rows expire after SESSION_JOIN_TTL_SECONDS; expired rows are
 * ignored (and replaced on the next join).
 *
 * `server_id` is deliberately *not* a foreign key: the native `/api/session/*`
 * endpoints only accept admin-registered ids, while the authlib-injector
 * compatible `/api/sessionserver/*` endpoints store the per-handshake hash the
 * game server computes (an opaque value that lives in no registry).
 */
export const gameSession = sqliteTable(
  'game_session',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    playerUuid: text('player_uuid')
      .notNull()
      .references(() => player.uuid, { onDelete: 'cascade' }),
    serverId: text('server_id').notNull(),
    /** Client IP observed at joinServer, compared with hasJoined's `ip`. */
    ip: text('ip'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    uniqueIndex('game_session_player_server_unique').on(t.playerUuid, t.serverId),
    index('game_session_server_id_idx').on(t.serverId),
    index('game_session_expires_at_idx').on(t.expiresAt),
  ],
);
