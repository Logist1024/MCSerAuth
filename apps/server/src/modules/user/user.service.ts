import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ErrorCode,
  normalizeUserRole,
  type ActivateTextureResponse,
  type DeleteTextureResponse,
  type PublicUserProfile,
  type RenamePlayerResponse,
  type UpdateProfileRequest,
  type UserSettingsResponse,
} from '@mcserauth/shared';
import { and, count, eq, sql } from 'drizzle-orm';
import { BusinessException } from '../../common/exceptions/business.exception.js';
import { DbService } from '../../db/db.service.js';
import {
  nicknameReservation,
  player as playerTable,
  post as postTable,
  reply as replyTable,
  user as userTable,
  userPermission,
} from '../../db/schema/index.js';
import { ForumService } from '../forum/forum.service.js';
import { ProgressService } from '../growth/progress.service.js';
import { NicknameReservationService } from '../auth/nickname-reservation.service.js';
import { verifyAccountPassword } from '../auth/account-password.js';
import { OAuthService } from '../auth/oauth.service.js';
import type { ChangeEmailRequest } from '@mcserauth/shared';
import { TextureService } from '../profiles/texture.service.js';
const RENAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
/** Website account settings, player rename and texture switching. */
@Injectable()
export class UserService {
  constructor(
    private readonly db: DbService,
    private readonly oauth: OAuthService,
    private readonly textures: TextureService,
    private readonly forum: ForumService,
    private readonly reservations: NicknameReservationService,
    private readonly progress: ProgressService,
  ) {}
  /**
   * Changes the account email after re-proving the password.
   *
   * better-auth's own `/change-email` needs outgoing verification mail, which
   * the project has not implemented yet (M-phase). This direct update keeps
   * Yggdrasil `/authenticate` (which matches on `lower(email)`) in sync, and
   * runs in a transaction so a concurrent sign-up cannot claim the address.
   */
  async changeEmail(userId: string, input: ChangeEmailRequest): Promise<UserSettingsResponse> {
    const user = await this.requireUser(userId);
    if (!(await verifyAccountPassword(this.db, userId, input.currentPassword))) {
      throw new UnauthorizedException('当前密码不正确');
    }
    const newEmail = input.newEmail.trim().toLowerCase();
    if (newEmail.toLowerCase() === user.email.toLowerCase()) {
      throw new BadRequestException('新邮箱与当前邮箱相同');
    }
    const existing = (
      await this.db.db
        .select({ id: userTable.id })
        .from(userTable)
        .where(sql`lower(${userTable.email}) = ${newEmail}`)
    )[0];
    if (existing) {
      throw new ConflictException('该邮箱已被其他账号使用');
    }
    try {
      await this.db.transaction(async (tx) => {
        await tx
          .update(userTable)
          .set({ email: newEmail, updatedAt: new Date() })
          .where(eq(userTable.id, userId));
      });
      // The unique index backs the update above: a concurrent sign-up claiming
      // the same address would collide here and land in the handler below.
    } catch (error) {
      if (error instanceof Error && error.message.includes('user.email')) {
        throw new ConflictException('该邮箱已被其他账号使用');
      }
      throw error;
    }
    return await this.getSettings(userId);
  }
  async getSettings(userId: string): Promise<UserSettingsResponse> {
    const user = await this.requireUser(userId);
    const player = await this.oauth.getPlayerForUser(userId);
    const cooldownUntil = player?.nameCooldownAt
      ? new Date(player.nameCooldownAt.getTime() + RENAME_COOLDOWN_MS)
      : null;
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        signature: user.signature,
        role: normalizeUserRole(user.role),
        banned: user.banned,
        permissions: (
          await this.db.db
            .select({ permission: userPermission.permission })
            .from(userPermission)
            .where(eq(userPermission.userId, user.id))
        ).map((row) => row.permission),
        mutedUntil: user.mutedUntil?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
      },
      player: player
        ? {
            uuid: player.uuid,
            nickname: player.nickname,
            previousNickname: player.previousNickname,
            nicknameHistory: player.nicknameHistory.filter((name) => name !== player.nickname),
            nameCooldownAt: player.nameCooldownAt?.toISOString() ?? null,
            renameAvailableAt:
              cooldownUntil !== null && cooldownUntil.getTime() > Date.now()
                ? cooldownUntil.toISOString()
                : null,
            banned: player.banned,
            createdAt: player.createdAt.toISOString(),
          }
        : null,
    };
  }
  async updateProfile(userId: string, input: UpdateProfileRequest): Promise<UserSettingsResponse> {
    const user = await this.requireUser(userId);
    const avatarUrl = normalizeAvatarUrl(input.avatarUrl, user.avatarUrl);
    await this.db.db
      .update(userTable)
      .set({
        ...(input.signature === undefined
          ? {}
          : {
              signature:
                input.signature === null || input.signature.trim() === ''
                  ? null
                  : input.signature.trim(),
            }),
        ...(input.avatarUrl === undefined ? {} : { avatarUrl }),
      })
      .where(eq(userTable.id, userId));
    return await this.getSettings(userId);
  }
  async renamePlayer(userId: string, nicknameInput: string): Promise<RenamePlayerResponse> {
    const player = await this.oauth.getPlayerForUser(userId);
    if (!player) {
      throw new BadRequestException('尚未创建游戏角色，请先完成一次启动器授权');
    }
    const nickname = nicknameInput.trim();
    if (nickname === player.nickname) {
      throw new BadRequestException('新昵称与当前昵称相同');
    }
    const now = new Date();
    if (
      player.nameCooldownAt !== null &&
      player.nameCooldownAt.getTime() + RENAME_COOLDOWN_MS > now.getTime()
    ) {
      const days = Math.ceil(
        (player.nameCooldownAt.getTime() + RENAME_COOLDOWN_MS - now.getTime()) / 86400000,
      );
      throw new BusinessException(ErrorCode.RENAME_COOLDOWN, 400, `改名冷却中，约还需 ${days} 天`);
    }
    const taken = (
      await this.db.db
        .select({ uuid: playerTable.uuid })
        .from(playerTable)
        .where(eq(playerTable.nickname, nickname))
    )[0];
    if (taken) {
      throw new BusinessException(ErrorCode.NICKNAME_TAKEN, 409, '该昵称已被使用');
    }
    if (await this.reservations.isReservedByOther(nickname, player.uuid)) {
      throw new BusinessException(ErrorCode.NICKNAME_TAKEN, 409, '该昵称处于 30 天保留期');
    }
    const history = [...new Set([...player.nicknameHistory, player.nickname])];
    const cooldownUntil = new Date(now.getTime() + RENAME_COOLDOWN_MS);
    try {
      await this.db.transaction(async (tx) => {
        await tx
          .update(playerTable)
          .set({
            nickname,
            previousNickname: player.nickname,
            nicknameHistory: history,
            nameCooldownAt: now,
          })
          .where(eq(playerTable.uuid, player.uuid));
        await this.db.upsert(
          nicknameReservation,
          {
            nickname: player.nickname,
            playerUuid: player.uuid,
            reservedUntil: cooldownUntil,
          },
          {
            target: nicknameReservation.nickname,
            set: { playerUuid: player.uuid, reservedUntil: cooldownUntil },
          },
          tx,
        );
      });
    } catch {
      throw new BusinessException(ErrorCode.NICKNAME_TAKEN, 409, '该昵称已被使用');
    }
    return {
      uuid: player.uuid,
      nickname,
      previousNickname: player.nickname,
      cooldownUntil: cooldownUntil.toISOString(),
      nicknameHistory: history,
    };
  }
  async getPublicProfile(userId: string): Promise<PublicUserProfile> {
    const user = (await this.db.db.select().from(userTable).where(eq(userTable.id, userId)))[0];
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    const player = await this.oauth.getPlayerForUser(userId);
    const postCount = (
      await this.db.db
        .select({ value: count() })
        .from(postTable)
        .where(and(eq(postTable.authorId, userId), eq(postTable.status, 'published')))
    )[0];
    const replyCount = (
      await this.db.db
        .select({ value: count() })
        .from(replyTable)
        .where(and(eq(replyTable.authorId, userId), eq(replyTable.status, 'published')))
    )[0];
    const progress = await this.progress.summary(userId);
    return {
      user: {
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
        signature: user.signature,
        role: normalizeUserRole(user.role),
        createdAt: user.createdAt.toISOString(),
      },
      player: player
        ? { uuid: player.uuid, nickname: player.nickname, banned: player.banned }
        : null,
      stats: { posts: postCount?.value ?? 0, replies: replyCount?.value ?? 0 },
      progress: {
        level: progress.level,
        xp: progress.xp,
        points: progress.points,
        tierName: progress.levelTier.name,
        title: progress.title ? { name: progress.title.name, color: progress.title.color } : null,
        checkinStreak: progress.checkinStreak,
      },
      recentPosts: await this.forum.recentPostsByUser(userId, 5),
    };
  }
  async activateTexture(userId: string, textureId: number): Promise<ActivateTextureResponse> {
    const player = await this.oauth.getPlayerForUser(userId);
    if (!player) {
      throw new BadRequestException('尚未创建游戏角色');
    }
    return this.textures.activate(player, textureId);
  }
  async deleteTexture(userId: string, textureId: number): Promise<DeleteTextureResponse> {
    const player = await this.oauth.getPlayerForUser(userId);
    if (!player) {
      throw new NotFoundException('纹理不存在');
    }
    return await this.textures.delete(player, textureId);
  }
  private async requireUser(userId: string) {
    const row = (await this.db.db.select().from(userTable).where(eq(userTable.id, userId)))[0];
    if (!row) {
      throw new NotFoundException('账号不存在');
    }
    return row;
  }
}
function normalizeAvatarUrl(
  value: string | null | undefined,
  current: string | null,
): string | null {
  if (value === undefined) {
    return current;
  }
  if (value === null || value.trim() === '') {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new BadRequestException('头像地址不合法');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException('头像地址仅支持 http/https');
  }
  return url.toString();
}
