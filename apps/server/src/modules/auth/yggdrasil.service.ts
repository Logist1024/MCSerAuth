import { ForbiddenException, Injectable } from '@nestjs/common';
import type {
  YggdrasilAuthenticateRequest,
  YggdrasilAuthenticateResponse,
  YggdrasilInvalidateRequest,
  YggdrasilMetadata,
  YggdrasilProfile,
  YggdrasilRefreshRequest,
  YggdrasilRefreshResponse,
} from '@mcserauth/shared';
import { timingSafeEqual } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { APP_VERSION } from '../../app.constants.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { DbService } from '../../db/db.service.js';
import {
  player as playerTable,
  token as tokenTable,
  user as userTable,
} from '../../db/schema/index.js';
import { verifyAccountPassword } from './account-password.js';
import { OAuthService, type RequestMeta } from './oauth.service.js';
import { generateOpaqueToken, sha256 } from './oauth.util.js';
type UserRow = typeof userTable.$inferSelect;
type PlayerRow = typeof playerTable.$inferSelect;
type TokenRow = typeof tokenTable.$inferSelect;
/** Yggdrasil-compatible messages; launchers surface these verbatim. */
const INVALID_CREDENTIALS = 'Invalid credentials. Invalid username or password.';
const INVALID_TOKEN = 'Invalid token.';
/**
 * authlib-injector / Yggdrasil compatibility layer (HMCL, PCL2, XMCL…).
 *
 * Launchers authenticate with the website e-mail + password instead of the
 * browser OAuth flow, then reuse the exact same launcher `token` rows, so a
 * Yggdrasil login and an OAuth authorization are interchangeable afterwards
 * (`/api/user/profiles/me`, textures, `/api/admin/*` device list).
 */
function safeEqualHash(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(actual, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}
@Injectable()
export class YggdrasilService {
  constructor(
    private readonly config: AppConfigService,
    private readonly db: DbService,
    private readonly oauth: OAuthService,
  ) {}
  /**
   * GET <root> — metadata read by launchers before anything else.
   *
   * No `signaturePublickey` is advertised: textures are served unsigned, and
   * authlib-injector only verifies the `textures` property when a key is
   * present in the metadata.
   */
  metadata(): YggdrasilMetadata {
    const skinDomains = new Set<string>(['localhost', '127.0.0.1']);
    for (const value of [this.config.authUrl, this.config.appUrl]) {
      try {
        skinDomains.add(new URL(value).hostname);
      } catch {
        // Misconfiguration is already rejected by env validation.
      }
    }
    return {
      meta: {
        serverName: 'MCSerAuth',
        implementationName: 'MCSerAuth',
        implementationVersion: APP_VERSION,
        links: { homepage: this.config.appUrl },
      },
      skinDomains: [...skinDomains],
    };
  }
  async authenticate(
    input: YggdrasilAuthenticateRequest,
    meta: RequestMeta,
  ): Promise<YggdrasilAuthenticateResponse> {
    const userRow = (
      await this.db.db
        .select()
        .from(userTable)
        .where(sql`lower(${userTable.email}) = ${input.username.trim().toLowerCase()}`)
    )[0];
    if (!userRow || !(await this.verifyPassword(userRow.id, input.password))) {
      throw new ForbiddenException(INVALID_CREDENTIALS);
    }
    if (userRow.banned) {
      throw new ForbiddenException('该玩家已被封禁');
    }
    const playerRow = await this.oauth.ensurePlayerForUser(userRow.id, userRow.name);
    if (playerRow.banned) {
      throw new ForbiddenException('该玩家已被封禁');
    }
    const clientToken = input.clientToken ?? generateOpaqueToken('mcs_ct_');
    const tokens = await this.oauth.issueTokens(playerRow, userRow, meta, sha256(clientToken));
    const profile = this.toProfile(playerRow);
    return {
      accessToken: tokens.access_token,
      clientToken,
      availableProfiles: [profile],
      selectedProfile: profile,
      ...(input.requestUser === true ? { user: { id: userRow.id } } : {}),
    };
  }
  /** Rotates the access token in place; the previous one stops working. */
  async refresh(
    input: YggdrasilRefreshRequest,
    meta: RequestMeta,
  ): Promise<YggdrasilRefreshResponse> {
    const row = await this.findActiveToken(input.accessToken);
    if (!row) {
      throw new ForbiddenException(INVALID_TOKEN);
    }
    // Yggdrasil spec: a clientToken sent at authenticate must match on refresh.
    // OAuth-issued tokens have no binding (NULL) and old rows stay accepted.
    const boundClientToken = row.token.clientTokenHash;
    if (input.clientToken !== undefined && boundClientToken !== null) {
      if (!safeEqualHash(boundClientToken, sha256(input.clientToken))) {
        throw new ForbiddenException('Invalid client token.');
      }
    }
    const accessToken = generateOpaqueToken('mcs_at_');
    const now = new Date();
    const updated = (
      await this.db.db
        .update(tokenTable)
        .set({
          accessTokenHash: sha256(accessToken),
          deviceName: this.deviceName(meta),
          ip: meta.ip ?? null,
          expiresAt: new Date(now.getTime() + this.config.oauthAccessTokenTtlSeconds * 1000),
        })
        .where(
          and(
            eq(tokenTable.id, row.token.id),
            isNull(tokenTable.revokedAt),
            eq(tokenTable.accessTokenHash, sha256(input.accessToken)),
          ),
        )
        .returning({ id: tokenTable.id })
    )[0];
    if (!updated) {
      throw new ForbiddenException(INVALID_TOKEN);
    }
    return {
      accessToken,
      clientToken: input.clientToken ?? generateOpaqueToken('mcs_ct_'),
      selectedProfile: this.toProfile(row.player),
      ...(input.requestUser === true ? { user: { id: row.user.id } } : {}),
    };
  }
  /** 204 on success; unknown/expired/revoked/banned → 403. */
  async validate(accessToken: string): Promise<void> {
    const row = await this.findActiveToken(accessToken);
    if (!row) {
      throw new ForbiddenException(INVALID_TOKEN);
    }
  }
  /** Idempotent: an unknown or already revoked token still answers 204. */
  async invalidate(input: YggdrasilInvalidateRequest): Promise<void> {
    await this.db.db
      .update(tokenTable)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(tokenTable.accessTokenHash, sha256(input.accessToken)),
          isNull(tokenTable.revokedAt),
        ),
      );
  }
  private async verifyPassword(userId: string, password: string): Promise<boolean> {
    return await verifyAccountPassword(this.db, userId, password);
  }
  private async findActiveToken(accessToken: string): Promise<{
    token: TokenRow;
    player: PlayerRow;
    user: UserRow;
  } | null> {
    const row = (
      await this.db.db
        .select({ token: tokenTable, player: playerTable, user: userTable })
        .from(tokenTable)
        .innerJoin(playerTable, eq(tokenTable.playerUuid, playerTable.uuid))
        .innerJoin(userTable, eq(playerTable.userId, userTable.id))
        .where(eq(tokenTable.accessTokenHash, sha256(accessToken)))
    )[0];
    if (!row || row.token.revokedAt !== null) {
      return null;
    }
    if (row.token.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    if (row.player.banned || row.user.banned) {
      return null;
    }
    return row;
  }
  private toProfile(playerRow: PlayerRow): YggdrasilProfile {
    return { id: playerRow.uuid, name: playerRow.nickname };
  }
  private deviceName(meta: RequestMeta): string | null {
    const userAgent = meta.userAgent?.trim();
    return userAgent ? userAgent.slice(0, 255) : null;
  }
}
