import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { SKIN_KINDS, SKIN_STATUSES, SKIN_VARIANTS } from '@mcserauth/shared';
import { player } from './player.js';
import { user } from './user.js';

/**
 * Skins and capes share one table (S2), distinguished by `kind`.
 * Image bytes live under UPLOAD_DIR; `file_path` is relative to it.
 */
export const skin = sqliteTable(
  'skin',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    playerUuid: text('player_uuid')
      .notNull()
      .references(() => player.uuid, { onDelete: 'cascade' }),
    kind: text('kind', { enum: SKIN_KINDS }).notNull(),
    /** `classic` / `slim` for skins; NULL for capes. */
    variant: text('variant', { enum: SKIN_VARIANTS }),
    filePath: text('file_path').notNull(),
    sha256: text('sha256').notNull(),
    textureUrl: text('texture_url'),
    status: text('status', { enum: SKIN_STATUSES }).notNull().default('pending'),
    /** Only one active texture per (player, kind) — enforced by partial index. */
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
    uploadedAt: integer('uploaded_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    reviewedBy: text('reviewed_by').references(() => user.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('skin_player_uuid_idx').on(t.playerUuid),
    index('skin_sha256_idx').on(t.sha256),
    index('skin_status_idx').on(t.status),
    index('skin_is_active_idx').on(t.isActive),
    uniqueIndex('skin_active_unique_idx')
      .on(t.playerUuid, t.kind)
      .where(sql`${t.isActive} = 1`),
  ],
);
