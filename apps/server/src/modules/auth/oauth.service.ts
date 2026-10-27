import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  PROTOCOL_TOKEN_TYPE,
  USER_ROLES,
  type OAuthAuthenticateRequest,
  type OAuthTokenResponse,
  type OAuthUserSummary,
  type UserProfilesMeResponse,
} from '@mcserauth/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { AppConfigService } from '../../config/app-config.service.js';
import { DbService } from '../../db/db.service.js';
import {
  oauthCode,
  player as playerTable,
  token as tokenTable,
  user as userTable,
} from '../../db/schema/index.js';
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
    if (input.redirect_uri !== undefined && input.redirect_uri !== codeRow.redirectUri) {
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
    );
  }
  async refreshAccessToken(refreshToken: string, meta: RequestMeta): Promise<OAuthTokenResponse> {
    const currentHash = sha256(refreshToken);
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
    const userRow = (await this.db.db.select().from(userTable).where(eq(userTable.id, userId)))[0];
    if (!userRow) {
      throw new UnauthorizedException('账号不存在');
    }
    if (userRow.banned) {
      throw new ForbiddenException('该账号已被封禁，无法完成授权');
    }
    const playerRow = await this.getPlayerForUser(userId);
    if (playerRow?.banned) {
      throw new ForbiddenException('该玩家已被封禁，无法完成授权');
    }
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
   * refreshes can reject mismatches per the Yggdrasil spec.
   */
  async issueTokens(
    playerRow: PlayerRow,
    userRow: UserRow,
    meta: RequestMeta,
    clientTokenHash?: string,
  ): Promise<OAuthTokenResponse> {
    const accessToken = generateOpaqueToken('mcs_at_');
    const refreshToken = generateOpaqueToken('mcs_rt_');
    const now = new Date();
    await this.db.db.insert(tokenTable).values({
      playerUuid: playerRow.uuid,
      accessTokenHash: sha256(accessToken),
      refreshTokenHash: sha256(refreshToken),
      clientTokenHash: clientTokenHash ?? null,
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
