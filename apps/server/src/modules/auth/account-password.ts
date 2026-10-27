import argon2 from 'argon2';
import { and, eq } from 'drizzle-orm';
import type { DbService } from '../../db/db.service.js';
import { account as accountTable } from '../../db/schema/index.js';
/**
 * Shared credential-password verification for anything that must re-prove the
 * account password outside better-auth's own endpoints (email change,
 * Yggdrasil authenticate). better-auth holds the argon2id hash produced by our
 * custom hasher in the `credential` provider account row.
 */
export async function findCredentialAccount(
  db: DbService,
  userId: string,
): Promise<{
  id: string;
  passwordHash: string;
} | null> {
  const row = (
    await db.db
      .select({ id: accountTable.id, password: accountTable.password })
      .from(accountTable)
      .where(and(eq(accountTable.userId, userId), eq(accountTable.providerId, 'credential')))
  )[0];
  if (!row?.password) {
    return null;
  }
  return { id: row.id, passwordHash: row.password };
}
export async function verifyAccountPassword(
  db: DbService,
  userId: string,
  password: string,
): Promise<boolean> {
  const account = await findCredentialAccount(db, userId);
  if (!account) {
    return false;
  }
  try {
    return await argon2.verify(account.passwordHash, password);
  } catch {
    return false;
  }
}
