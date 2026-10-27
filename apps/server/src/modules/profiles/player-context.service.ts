import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { OAuthService } from '../auth/oauth.service.js';
import { player as playerTable } from '../../db/schema/index.js';
type PlayerRow = typeof playerTable.$inferSelect;
export interface PlayerActor {
  userId: string;
  player: PlayerRow;
}
/**
 * Resolves the player behind a texture/profile request.
 *
 * Same dual-authentication rule as `/user/profiles/me`: a launcher Bearer token
 * takes precedence and must be valid (no silent cookie fallback); otherwise the
 * better-auth website session is used. Website accounts get their 1:1 player
 * provisioned on first texture access.
 */
@Injectable()
export class PlayerContextService {
  constructor(
    private readonly auth: AuthService,
    private readonly oauth: OAuthService,
  ) {}
  async requirePlayer(request: Request): Promise<PlayerActor> {
    const authorization = request.headers.authorization;
    if (authorization !== undefined) {
      const match = /^Bearer\s+(\S+)$/i.exec(authorization);
      const accessToken = match?.[1];
      if (!accessToken) {
        throw new UnauthorizedException('Authorization 头格式应为 Bearer <access_token>');
      }
      const profile = await this.oauth.resolveAccessToken(accessToken);
      if (!profile?.player) {
        throw new UnauthorizedException('访问令牌无效或已过期');
      }
      const player = await this.oauth.getPlayerByUuid(profile.player.uuid);
      if (!player) {
        throw new UnauthorizedException('玩家档案不存在');
      }
      if (player.banned) {
        throw new ForbiddenException('该玩家已被封禁');
      }
      return { userId: profile.user.id, player };
    }
    const session = await this.auth.getSession(request.headers);
    if (!session) {
      throw new UnauthorizedException('未登录或登录已失效');
    }
    const player = await this.oauth.ensurePlayerForUser(session.user.id, session.user.name);
    if (player.banned) {
      throw new ForbiddenException('该玩家已被封禁');
    }
    return { userId: session.user.id, player };
  }
}
