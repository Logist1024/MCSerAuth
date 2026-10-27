import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { player } from './player.js';

/**
 * Launcher authorization tokens. Only hashes are persisted; plaintext tokens
 * never touch the database or logs.
 * S5: revocation is soft (`revoked_at`), rows are never deleted.
 */
export const token = sqliteTable(
  'token',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    playerUuid: text('player_uuid')
      .notNull()
      .references(() => player.uuid, { onDelete: 'cascade' }),
    accessTokenHash: text('access_token_hash').notNull().unique(),
    refreshTokenHash: text('refresh_token_hash').notNull().unique(),
    /**
     * Yggdrasil clientToken binding: hashed value chosen at /authenticate.
     * NULL for OAuth-issued tokens (no clientToken concept) and legacy rows.
     */
    clientTokenHash: text('client_token_hash'),
    deviceName: text('device_name'),
    ip: text('ip'),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    /** Last time the access token authenticated a request (coarse, 60s). */
    lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
    /** NULL = valid; set once, never cleared (soft delete). */
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('token_player_uuid_idx').on(t.playerUuid),
    index('token_expires_at_idx').on(t.expiresAt),
  ],
);
