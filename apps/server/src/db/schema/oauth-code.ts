import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './user.js';

/**
 * Short-lived OAuth authorization codes issued by the consent page.
 *
 * Only the SHA-256 hash of the code is persisted. A row is single-use
 * (`used_at`) and expires after `OAUTH_AUTH_CODE_TTL_SECONDS`. PKCE fields are
 * carried here so the launcher's exchange can be verified without server-side
 * client secrets.
 */
export const oauthCode = sqliteTable(
  'oauth_code',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    codeHash: text('code_hash').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    clientId: text('client_id'),
    redirectUri: text('redirect_uri').notNull(),
    scope: text('scope'),
    codeChallenge: text('code_challenge'),
    codeChallengeMethod: text('code_challenge_method', { enum: ['S256', 'plain'] }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    /** NULL = unused; set once, never cleared. */
    usedAt: integer('used_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('oauth_code_user_id_idx').on(t.userId),
    index('oauth_code_expires_at_idx').on(t.expiresAt),
  ],
);
