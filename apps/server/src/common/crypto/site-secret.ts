import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM helper for secrets stored in `site_setting` (SMTP password,
 * captcha secret). The key is derived from BETTER_AUTH_SECRET so a database
 * dump alone cannot recover the values.
 */

const SECRET_PREFIX = 'enc:v1:';

function deriveKey(appSecret: string): Buffer {
  return createHash('sha256').update(`site-secret:${appSecret}`).digest();
}

export function encryptSiteSecret(plain: string, appSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(appSecret), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${SECRET_PREFIX}${iv.toString('base64url')}:${cipher
    .getAuthTag()
    .toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptSiteSecret(stored: string, appSecret: string): string | null {
  if (!stored.startsWith(SECRET_PREFIX)) {
    return null;
  }
  const [ivPart, tagPart, dataPart] = stored.slice(SECRET_PREFIX.length).split(':');
  if (!ivPart || !tagPart || !dataPart) {
    return null;
  }
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      deriveKey(appSecret),
      Buffer.from(ivPart, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
