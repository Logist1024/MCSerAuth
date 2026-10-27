import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Short-lived built-in captcha challenges.
 *
 * The answer is stored as a hash; the row tracks verification and token usage
 * so a solved captcha can only be redeemed once.
 */
export const captchaChallenge = sqliteTable(
  'captcha_challenge',
  {
    id: text('id').primaryKey(),
    answerHash: text('answer_hash').notNull(),
    provider: text('provider').notNull().default('builtin'),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    verifiedAt: integer('verified_at', { mode: 'timestamp' }),
    tokenUsedAt: integer('token_used_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('captcha_challenge_expires_idx').on(t.expiresAt),
    index('captcha_challenge_token_used_idx').on(t.tokenUsedAt),
  ],
);
