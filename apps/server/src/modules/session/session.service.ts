import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  type GameProfile,
  type HasJoinedQuery,
  type JoinServerRequest,
  normalizeProtocolUuid,
} from '@mcserauth/shared';
import { and, eq, gt } from 'drizzle-orm';
import { AppConfigService } from '../../config/app-config.service.js';
import { DbService } from '../../db/db.service.js';
import { gameSession, player as playerTable, serverEntry } from '../../db/schema/index.js';
import { OAuthService } from '../auth/oauth.service.js';
import { TextureService } from '../profiles/texture.service.js';
export interface SessionRequestMeta {
  ip?: string;
}
export interface SessionOptions {
  /**
   * Native `/api/session/*` callers must use an admin-registered `serverId`;
   * the authlib-injector compatible endpoints pass `false` because launchers
   * send the per-handshake hash instead. Defaults to `true`.
   */
  enforceServerWhitelist?: boolean;
}
function normalizeIp(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  const withoutMappedPrefix = trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
  return withoutMappedPrefix.length > 0 ? withoutMappedPrefix : null;
}
/**
 * Minecraft session service (Yggdrasil joinServer/hasJoined semantics).
 *
 * joinServer binds the launcher token's player to a whitelisted server for a
 * short window; hasJoined lets that server redeem the registration and obtain
 * the GameProfile (with textures). Banned players are rejected here, which is
 * the enforcement point for "next login" bans.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly config: AppConfigService,
    private readonly db: DbService,
    private readonly oauth: OAuthService,
    private readonly textures: TextureService,
  ) {}
  async joinServer(
    input: JoinServerRequest,
    meta: SessionRequestMeta,
    options: SessionOptions = {},
  ): Promise<void> {
    if (options.enforceServerWhitelist !== false) {
      await this.assertServerAllowed(input.serverId);
    }
    const profile = await this.oauth.resolveAccessToken(input.accessToken);
    if (!profile?.player) {
      throw new UnauthorizedException('访问令牌无效或已过期');
    }
    const selectedProfile = normalizeProtocolUuid(input.selectedProfile);
    if (selectedProfile === null) {
      throw new BadRequestException('selectedProfile 必须是 32 位十六进制 UUID');
    }
    if (selectedProfile !== profile.player.uuid) {
      throw new ForbiddenException('selectedProfile 与访问令牌不匹配');
    }
    if (profile.player.banned) {
      throw new ForbiddenException('该玩家已被封禁');
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.sessionJoinTtlSeconds * 1000);
    await this.db.upsert(
      gameSession,
      {
        playerUuid: profile.player.uuid,
        serverId: input.serverId,
        ip: normalizeIp(meta.ip),
        createdAt: now,
        expiresAt,
      },
      {
        target: [gameSession.playerUuid, gameSession.serverId],
        set: { ip: normalizeIp(meta.ip), createdAt: now, expiresAt },
      },
    );
  }
  async hasJoined(
    input: HasJoinedQuery,
    options: SessionOptions = {},
  ): Promise<GameProfile | null> {
    if (options.enforceServerWhitelist !== false) {
      await this.assertServerAllowed(input.serverId);
    }
    const player = (
      await this.db.db.select().from(playerTable).where(eq(playerTable.nickname, input.username))
    )[0];
    // Unknown username and "no session" intentionally share the 204 result so
    // the endpoint cannot be used to enumerate accounts.
    if (!player) {
      return null;
    }
    if (player.banned) {
      throw new ForbiddenException('该玩家已被封禁');
    }
    const session = (
      await this.db.db
        .select()
        .from(gameSession)
        .where(
          and(
            eq(gameSession.playerUuid, player.uuid),
            eq(gameSession.serverId, input.serverId),
            gt(gameSession.expiresAt, new Date()),
          ),
        )
    )[0];
    if (!session) {
      return null;
    }
    const expectedIp = normalizeIp(session.ip);
    const actualIp = normalizeIp(input.ip);
    if (expectedIp !== null && actualIp !== null && expectedIp !== actualIp) {
      return null;
    }
    return await this.textures.buildGameProfile(player);
  }
  private async assertServerAllowed(serverId: string): Promise<void> {
    const entry = (
      await this.db.db.select().from(serverEntry).where(eq(serverEntry.serverId, serverId))
    )[0];
    if (!entry || !entry.enabled) {
      throw new ForbiddenException('服务器未在白名单内或已停用');
    }
  }
}
