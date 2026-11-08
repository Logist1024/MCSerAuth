import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  OAUTH_SCOPES,
  PROTOCOL_TOKEN_TYPE,
  USER_ROLES,
  parseOAuthScopes,
  type OAuthAuthenticateRequest,
  type OAuthRefreshRequest,
  type OAuthTokenResponse,
  type OAuthUserInfoResponse,
  type OAuthUserSummary,
  type UserProfilesMeResponse,
} from '@mcserauth/shared';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { AppConfigService } from '../../config/app-config.service.js';
import { DbService } from '../../db/db.service.js';
import {
  oauthCode,
  player as playerTable,
  token as tokenTable,
  user as userTable,
} from '../../db/schema/index.js';
import { OAuthClientService } from './oauth-client.service.js';
import {
  generateOpaqueToken,
  generatePlayerUuid,
  isPlausibleS256Challenge,
  isPlausiblePkceValue,
  nicknameCandidate,
  normalizeOrigin,
  sanitizeNickname,
  sha256,
  verifyPkce,
} from './oauth.util.js';
import { NicknameReservationService } from './nickname-reservation.service.js';
type UserRow = typeof userTable.$inferSelect;
type PlayerRow = typeof playerTable.$inferSelect;
export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}
export interface AuthorizationCodeInput {
  userId: string;
  clientId?: string;
  redirectUri: string;
  scope?: string;
  codeChallenge?: string;
  codeChallengeMethod?: 'S256' | 'plain';
}

/** Optional issuance context; `clientId`/`scope` tag registered-client tokens. */
export interface IssueTokensOptions {
  clientTokenHash?: string;
  clientId?: string | null;
  scope?: string | null;
}
/**
 * Commons-Designs OAuth core.
 *
 * Website accounts (better-auth `user`) authorize launchers through a
 * single-use code; launcher tokens are opaque random strings bound to the
 * account's 1:1 `player`. Only SHA-256 hashes of codes/tokens are persisted.
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  constructor(
    private readonly config: AppConfigService,
    private readonly db: DbService,
    private readonly reservations: NicknameReservationService,
    private readonly clients: OAuthClientService,
  ) {}
  /** CSRF defence for the browser-submitted consent form (SameSite=Lax + Origin). */
  assertTrustedOrigin(origin: string | undefined, required = false): void {
    if (!origin) {
      if (required) {
        throw new ForbiddenException('缺少请求来源，已拒绝授权');
      }
      return;
    }
    const allowed = [this.config.appUrl, this.config.authUrl]
      .map((value) => normalizeOrigin(value))
      .filter((value): value is string => value !== null);
    const actual = normalizeOrigin(origin);
    if (actual === null || !allowed.includes(actual)) {
      throw new ForbiddenException('请求来源不受信任');
    }
  }
  validatePkceInput(codeChallenge: string | undefined, method: 'S256' | 'plain' | undefined): void {
    if (codeChallenge === undefined) {
      if (method !== undefined) {
        throw new BadRequestException('code_challenge_method 需要与 code_challenge 一起使用');
      }
      return;
    }
    const effectiveMethod = method ?? 'plain';
    const valid =
      effectiveMethod === 'S256'
        ? isPlausibleS256Challenge(codeChallenge)
        : isPlausiblePkceValue(codeChallenge);
    if (!valid) {
      throw new BadRequestException('code_challenge 格式不合法');
    }
  }
  async createAuthorizationCode(input: AuthorizationCodeInput): Promise<string> {
    const code = generateOpaqueToken('mcs_code_');
    const now = new Date();
    await this.db.db.insert(oauthCode).values({
      codeHash: sha256(code),
      userId: input.userId,
      clientId: input.clientId ?? null,
      redirectUri: input.redirectUri,
      scope: input.scope ?? null,
      codeChallenge: input.codeChallenge ?? null,
      codeChallengeMethod: input.codeChallenge ? (input.codeChallengeMethod ?? 'plain') : null,
      expiresAt: new Date(now.getTime() + this.config.oauthAuthCodeTtlSeconds * 1000),
      createdAt: now,
    });
    return code;
  }
  async exchangeAuthorizationCode(
    input: OAuthAuthenticateRequest,
    meta: RequestMeta,
  ): Promise<OAuthTokenResponse> {
    const rawCode = input.code ?? input.token;
    if (!rawCode) {
      throw new BadRequestException('code 或 token 必须提供其一');
    }
    const codeRow = (
      await this.db.db
        .select()
        .from(oauthCode)
        .where(eq(oauthCode.codeHash, sha256(rawCode)))
    )[0];
    if (!codeRow || codeRow.usedAt !== null) {
      throw new UnauthorizedException('授权码无效或已使用');
    }
    if (codeRow.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('授权码已过期');
    }
    if (
      input.client_id !== undefined &&
      codeRow.clientId !== null &&
      input.client_id !== codeRow.clientId
    ) {
      throw new UnauthorizedException('client_id 与授权码不匹配');
    }
    // Registered sibling-service clients must still be enabled and, when
    // confidential, prove their secret. Legacy launcher codes skip this.
    const clientRow =
      codeRow.clientId !== null ? await this.clients.findClient(codeRow.clientId) : null;
    if (clientRow && !clientRow.enabled) {
      throw new ForbiddenException('该客户端已被停用');
    }
    if (clientRow) {
      this.clients.verifyClientSecret(clientRow, input.client_secret);
    }
    if (codeRow.clientId !== null) {
      // RFC 6749 §4.1.3: registered clients must replay the exact redirect_uri
      // they used on the authorization request — missing counts as a mismatch.
      if (input.redirect_uri !== codeRow.redirectUri) {
        throw new UnauthorizedException('redirect_uri 与授权码不匹配');
      }
    } else if (input.redirect_uri !== undefined && input.redirect_uri !== codeRow.redirectUri) {
      throw new UnauthorizedException('redirect_uri 与授权码不匹配');
    }
    if (codeRow.codeChallenge !== null) {
      if (!input.code_verifier) {
        throw new BadRequestException('该授权码要求 PKCE，缺少 code_verifier');
      }
      if (
        !verifyPkce(
          input.code_verifier,
          codeRow.codeChallenge,
          codeRow.codeChallengeMethod ?? 'plain',
        )
      ) {
        throw new UnauthorizedException('PKCE 校验失败');
      }
    }
    const claimed = (
      await this.db.updateReturning(
        oauthCode,
        { usedAt: new Date() },
        and(eq(oauthCode.id, codeRow.id), isNull(oauthCode.usedAt)),
      )
    )[0];
    if (!claimed) {
      throw new UnauthorizedException('授权码无效或已使用');
    }
    const userRow = (
      await this.db.db.select().from(userTable).where(eq(userTable.id, codeRow.userId))
    )[0];
    if (!userRow) {
      throw new UnauthorizedException('账号不存在');
    }
    await this.assertUserCanAuthorize(userRow.id);
    return await this.issueTokens(
      await this.ensurePlayerForUser(userRow.id, userRow.name),
      userRow,
      meta,
      {
        clientTokenHash: undefined,
        clientId: codeRow.clientId,
        scope: codeRow.scope,
      },
    );
  }
  async refreshAccessToken(
    input: OAuthRefreshRequest,
    meta: RequestMeta,
  ): Promise<OAuthTokenResponse> {
    const currentHash = sha256(input.refresh_token);
    const row = (
      await this.db.db
        .select({ token: tokenTable, player: playerTable, user: userTable })
        .from(tokenTable)
        .innerJoin(playerTable, eq(tokenTable.playerUuid, playerTable.uuid))
        .innerJoin(userTable, eq(playerTable.userId, userTable.id))
        .where(eq(tokenTable.refreshTokenHash, currentHash))
    )[0];
    if (!row || row.token.revokedAt !== null) {
      throw new UnauthorizedException('刷新令牌无效或已吊销');
    }
    if (
      row.token.createdAt.getTime() + this.config.oauthRefreshTokenTtlSeconds * 1000 <=
      Date.now()
    ) {
      throw new UnauthorizedException('刷新令牌已过期，请重新授权');
    }
    // Registered sibling-service clients must stay enabled and, when
    // confidential, re-authenticate with their secret (RFC 6749 §6). Legacy
    // launcher tokens (clientId null) keep the bare refresh-token check.
    if (row.token.clientId !== null) {
      if (input.client_id !== undefined && input.client_id !== row.token.clientId) {
        throw new UnauthorizedException('client_id 与刷新令牌不匹配');
      }
      const clientRow = await this.clients.findClient(row.token.clientId);
      if (clientRow && !clientRow.enabled) {
        throw new ForbiddenException('该客户端已被停用');
      }
      if (clientRow) {
        this.clients.verifyClientSecret(clientRow, input.client_secret);
      }
    }
    if (row.player.banned || row.user.banned) {
      throw new ForbiddenException('该玩家已被封禁');
    }
    const accessToken = generateOpaqueToken('mcs_at_');
    const nextRefreshToken = generateOpaqueToken('mcs_rt_');
    const now = new Date();
    // Rotation is optimistic: the old refresh hash must still be current.
    const updated = (
      await this.db.updateReturning(
        tokenTable,
        {
          accessTokenHash: sha256(accessToken),
          refreshTokenHash: sha256(nextRefreshToken),
          deviceName: this.deviceName(meta),
          ip: meta.ip ?? null,
          lastUsedAt: now,
          expiresAt: new Date(now.getTime() + this.config.oauthAccessTokenTtlSeconds * 1000),
        },
        and(
          eq(tokenTable.id, row.token.id),
          isNull(tokenTable.revokedAt),
          eq(tokenTable.refreshTokenHash, currentHash),
        ),
      )
    )[0];
    if (!updated) {
      throw new UnauthorizedException('刷新令牌已被使用，请重新授权');
    }
    return {
      access_token: accessToken,
      token_type: PROTOCOL_TOKEN_TYPE,
      expires_in: this.config.oauthAccessTokenTtlSeconds,
      refresh_token: nextRefreshToken,
      ...(row.token.scope !== null ? { scope: row.token.scope } : {}),
      user: this.toUserSummary(row.user),
    };
  }
  /** Resolves a launcher Bearer token; null when unknown, expired or revoked. */
  async resolveAccessToken(accessToken: string): Promise<UserProfilesMeResponse | null> {
    const row = (
      await this.db.db
        .select({ token: tokenTable, player: playerTable, user: userTable })
        .from(tokenTable)
        .innerJoin(playerTable, eq(tokenTable.playerUuid, playerTable.uuid))
        .innerJoin(userTable, eq(playerTable.userId, userTable.id))
        .where(eq(tokenTable.accessTokenHash, sha256(accessToken)))
    )[0];
    if (!row || row.token.revokedAt !== null || row.token.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    // Coarse last-used tracking: at most one write per minute per token.
    const lastUsedAt = row.token.lastUsedAt?.getTime() ?? 0;
    if (Date.now() - lastUsedAt > 60000) {
      await this.db.db
        .update(tokenTable)
        .set({ lastUsedAt: new Date() })
        .where(eq(tokenTable.id, row.token.id));
    }
    return {
      user: this.toUserSummary(row.user),
      player: {
        uuid: row.player.uuid,
        nickname: row.player.nickname,
        banned: row.player.banned,
      },
    };
  }

  /**
   * Scope-filtered account info for sibling services (`GET /oauth/userinfo`).
   * `basic` is always granted; `email` and `player` (the Minecraft UUID)
   * only appear when the token carries the matching scope. Tokens without a
   * recorded scope (legacy launchers) keep the full launcher view.
   */
  async resolveUserInfo(accessToken: string): Promise<OAuthUserInfoResponse | null> {
    const row = (
      await this.db.db
        .select({ token: tokenTable, player: playerTable, user: userTable })
        .from(tokenTable)
        .innerJoin(playerTable, eq(tokenTable.playerUuid, playerTable.uuid))
        .innerJoin(userTable, eq(playerTable.userId, userTable.id))
        .where(eq(tokenTable.accessTokenHash, sha256(accessToken)))
    )[0];
    if (!row || row.token.revokedAt !== null || row.token.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    const lastUsedAt = row.token.lastUsedAt?.getTime() ?? 0;
    if (Date.now() - lastUsedAt > 60000) {
      await this.db.db
        .update(tokenTable)
        .set({ lastUsedAt: new Date() })
        .where(eq(tokenTable.id, row.token.id));
    }
    const granted = parseOAuthScopes(row.token.scope);
    const legacy = row.token.scope === null;
    const has = (scope: (typeof OAUTH_SCOPES)[number]) => legacy || granted.includes(scope);
    return {
      user: {
        id: row.user.id,
        name: row.user.name,
        ...(has('email') ? { email: row.user.email } : {}),
      },
      ...(has('player')
        ? {
            player: {
              uuid: row.player.uuid,
              nickname: row.player.nickname,
              banned: row.player.banned,
            },
          }
        : {}),
    };
  }
  async getUserProfile(userId: string): Promise<UserProfilesMeResponse | null> {
    const row = (
      await this.db.db
        .select({ user: userTable, player: playerTable })
        .from(userTable)
        .leftJoin(playerTable, eq(playerTable.userId, userTable.id))
        .where(eq(userTable.id, userId))
    )[0];
    if (!row) {
      return null;
    }
    return {
      user: this.toUserSummary(row.user),
      player: row.player
        ? {
            uuid: row.player.uuid,
            nickname: row.player.nickname,
            banned: row.player.banned,
          }
        : null,
    };
  }
  async getPlayerForUser(userId: string): Promise<PlayerRow | null> {
    return (
      (await this.db.db.select().from(playerTable).where(eq(playerTable.userId, userId)))[0] ?? null
    );
  }
  async getPlayerByUuid(uuid: string): Promise<PlayerRow | null> {
    return (
      (await this.db.db.select().from(playerTable).where(eq(playerTable.uuid, uuid)))[0] ?? null
    );
  }
  /**
   * Rejects the whole authorization path for banned accounts. Browsers see a
   * clear message on the consent page instead of a failing token exchange.
   */
  async assertUserCanAuthorize(userId: string): Promise<void> {
    const reason = await this.getAuthorizationBlockReason(userId);
    if (reason === null) {
      return;
    }
    if (reason.accountMissing) {
      throw new UnauthorizedException(reason.message);
    }
    throw new ForbiddenException(reason.message);
  }

  /**
   * Non-throwing variant of {@link assertUserCanAuthorize} for page rendering:
   * returns the ban message to display, or null when authorization may proceed.
   */
  async getAuthorizationBlockReason(
    userId: string,
  ): Promise<{ accountMissing: boolean; message: string } | null> {
    const userRow = (await this.db.db.select().from(userTable).where(eq(userTable.id, userId)))[0];
    if (!userRow) {
      return { accountMissing: true, message: '账号不存在' };
    }
    if (userRow.banned) {
      return { accountMissing: false, message: '该账号已被封禁，无法完成授权' };
    }
    const playerRow = await this.getPlayerForUser(userId);
    if (playerRow?.banned) {
      return { accountMissing: false, message: '该玩家已被封禁，无法完成授权' };
    }
    return null;
  }

  /** Revokes every live token pair across all of a user's players (ban cleanup). */
  async revokeAllTokensForUser(userId: string): Promise<number> {
    const updated = await this.db.updateReturning(
      tokenTable,
      { revokedAt: new Date() },
      and(
        isNull(tokenTable.revokedAt),
        inArray(
          tokenTable.playerUuid,
          this.db.db
            .select({ uuid: playerTable.uuid })
            .from(playerTable)
            .where(eq(playerTable.userId, userId)),
        ),
      ),
    );
    return updated.length;
  }
  /**
   * First launcher authorization (or first website texture upload) provisions
   * the account's game identity. S1 makes the relation strictly 1:1, so this is
   * safe to call repeatedly.
   */
  async ensurePlayerForUser(userId: string, displayName: string): Promise<PlayerRow> {
    const existing = await this.getPlayerForUser(userId);
    if (existing) {
      return existing;
    }
    const base = sanitizeNickname(displayName);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const nickname = nicknameCandidate(base, attempt);
      const taken = (
        await this.db.db
          .select({ uuid: playerTable.uuid })
          .from(playerTable)
          .where(eq(playerTable.nickname, nickname))
      )[0];
      if (taken) {
        continue;
      }
      if (await this.reservations.isReservedByOther(nickname, null)) {
        continue;
      }
      try {
        await this.db.db.insert(playerTable).values({
          uuid: generatePlayerUuid(),
          userId,
          nickname,
          nicknameHistory: [nickname],
        });
      } catch (error) {
        const raced = await this.getPlayerForUser(userId);
        if (raced) {
          return raced;
        }
        this.logger.warn({ err: error }, 'player provisioning attempt failed; retrying');
        continue;
      }
      const created = await this.getPlayerForUser(userId);
      if (created) {
        return created;
      }
    }
    throw new InternalServerErrorException('无法为账号分配唯一的游戏昵称');
  }
  /**
   * Issues a launcher token pair. Shared by the OAuth code exchange and the
   * authlib-injector `/authserver/authenticate` compatibility endpoint.
   * `clientTokenHash` binds Yggdrasil tokens to the launcher's clientToken so
   * refreshes can reject mismatches per the Yggdrasil spec. `clientId`/`scope`
   * record the registered sibling-service client the token was issued for.
   */
  async issueTokens(
    playerRow: PlayerRow,
    userRow: UserRow,
    meta: RequestMeta,
    options: IssueTokensOptions = {},
  ): Promise<OAuthTokenResponse> {
    const accessToken = generateOpaqueToken('mcs_at_');
    const refreshToken = generateOpaqueToken('mcs_rt_');
    const now = new Date();
    await this.db.db.insert(tokenTable).values({
      playerUuid: playerRow.uuid,
      accessTokenHash: sha256(accessToken),
      refreshTokenHash: sha256(refreshToken),
      clientTokenHash: options.clientTokenHash ?? null,
      clientId: options.clientId ?? null,
      scope: options.scope ?? null,
      deviceName: this.deviceName(meta),
      ip: meta.ip ?? null,
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + this.config.oauthAccessTokenTtlSeconds * 1000),
      createdAt: now,
    });
    return {
      access_token: accessToken,
      token_type: PROTOCOL_TOKEN_TYPE,
      expires_in: this.config.oauthAccessTokenTtlSeconds,
      refresh_token: refreshToken,
      ...(options.scope !== undefined && options.scope !== null ? { scope: options.scope } : {}),
      user: this.toUserSummary(userRow),
    };
  }
  private deviceName(meta: RequestMeta): string | null {
    const userAgent = meta.userAgent?.trim();
    return userAgent ? userAgent.slice(0, 255) : null;
  }
  private toUserSummary(userRow: UserRow): OAuthUserSummary {
    return {
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      role: USER_ROLES.includes(userRow.role) ? userRow.role : 'user',
    };
  }
}
