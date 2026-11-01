import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  type AdminTitleOverview,
  type CreateTitleRequest,
  type SubmitTitleApplicationRequest,
  type TitleApplicationSummary,
  type UserTitleSummary,
} from '@mcserauth/shared';
import { and, desc, eq } from 'drizzle-orm';
import { DbService } from '../../db/db.service.js';
import {
  moderationLog,
  notification,
  title as titleTable,
  titleApplication,
  user as userTable,
  userTitle,
} from '../../db/schema/index.js';
import { RulesService } from './rules.service.js';
import { XpService } from './xp.service.js';
import { SPECIAL_TITLES, clampText, toTitleSummary, type TitleRow } from './growth.util.js';

/**
 * Title catalog, grants and the level-100 custom-title application flow.
 * Special titles are also the level-ladder exemption source for XpService.
 */
@Injectable()
export class TitlesService {
  private readonly logger = new Logger(TitlesService.name);
  constructor(
    private readonly db: DbService,
    private readonly rulesService: RulesService,
    private readonly xp: XpService,
  ) {}

  async seedSpecialTitles(): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const item of SPECIAL_TITLES) {
        await this.db.insertIgnore(
          titleTable,
          { name: item.name, description: item.description, color: item.color },
          tx,
        );
      }
    });
    this.logger.log(`Ensured ${SPECIAL_TITLES.length} special titles`);
  }

  async listTitles(): Promise<UserTitleSummary[]> {
    return (
      await this.db.db.select().from(titleTable).orderBy(titleTable.kind, desc(titleTable.id))
    ).map(toTitleSummary);
  }

  async submitTitleApplication(
    userId: string,
    input: SubmitTitleApplicationRequest,
  ): Promise<TitleApplicationSummary> {
    const progress = await this.xp.summary(userId);
    const rules = await this.rulesService.rules();
    if (progress.level < rules.titleApplicationLevel) {
      throw new ForbiddenException(`达到 ${rules.titleApplicationLevel} 级后才能申请专属称号`);
    }
    if (progress.title !== null) {
      throw new ConflictException('你已经拥有称号');
    }
    const pending = await this.pendingApplication(userId);
    if (pending) {
      throw new ConflictException('已有待审核的称号申请');
    }
    const proposedName = input.proposedName.trim();
    if (proposedName.length < 2 || proposedName.length > 20) {
      throw new BadRequestException('称号名称需要 2–20 个字符');
    }
    const reason = input.reason.trim();
    if (reason.length < 5 || reason.length > 300) {
      throw new BadRequestException('申请理由需要 5–300 个字符');
    }
    const nameTaken = (
      await this.db.db
        .select({ id: titleTable.id })
        .from(titleTable)
        .where(eq(titleTable.name, proposedName))
    )[0];
    if (nameTaken) {
      throw new ConflictException('该称号名称已被使用');
    }
    const [created] = await this.db.insertReturning(titleApplication, {
      userId,
      proposedName,
      reason,
    });
    if (created === undefined) {
      throw new Error('Failed to create title application.');
    }
    return await this.toApplicationSummary(created);
  }

  async pendingApplication(userId: string): Promise<TitleApplicationSummary | null> {
    const row = (
      await this.db.db
        .select()
        .from(titleApplication)
        .where(and(eq(titleApplication.userId, userId), eq(titleApplication.status, 'pending')))
        .orderBy(desc(titleApplication.createdAt))
    )[0];
    return row ? await this.toApplicationSummary(row) : null;
  }

  async adminTitleOverview(): Promise<AdminTitleOverview> {
    const titles = await this.db.db.select().from(titleTable).orderBy(desc(titleTable.id));
    const grants = await this.db.db
      .select({ titleId: userTitle.titleId, userId: userTitle.userId, name: userTable.name })
      .from(userTitle)
      .innerJoin(userTable, eq(userTitle.userId, userTable.id));
    const applications = await this.db.db
      .select({ application: titleApplication, name: userTable.name })
      .from(titleApplication)
      .innerJoin(userTable, eq(titleApplication.userId, userTable.id))
      .orderBy(desc(titleApplication.createdAt))
      .limit(50);
    return {
      titles: titles.map((row) => ({
        ...toTitleSummary(row),
        holders: grants
          .filter((grant) => grant.titleId === row.id)
          .map((grant) => ({ userId: grant.userId, name: grant.name })),
      })),
      applications: await Promise.all(
        applications.map(async (row) => await this.toApplicationSummary(row.application, row.name)),
      ),
    };
  }

  async createSpecialTitle(actorId: string, input: CreateTitleRequest): Promise<UserTitleSummary> {
    const name = input.name.trim();
    if (name.length < 2 || name.length > 20) {
      throw new BadRequestException('称号名称需要 2–20 个字符');
    }
    const color = input.color?.trim() ?? '#8b5cf6';
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      throw new BadRequestException('颜色必须是 #RRGGBB');
    }
    const existing = (
      await this.db.db
        .select({ id: titleTable.id })
        .from(titleTable)
        .where(eq(titleTable.name, name))
    )[0];
    if (existing) {
      throw new ConflictException('该称号名称已存在');
    }
    const [created] = await this.db.insertReturning(titleTable, {
      name,
      kind: 'special',
      description: clampText(input.description ?? undefined, 200),
      color,
      createdBy: actorId,
    });
    if (created === undefined) {
      throw new Error('Failed to create title.');
    }
    await this.log(actorId, 'grant_title', `created title ${name}`);
    return toTitleSummary(created);
  }

  async grantTitle(actorId: string, titleId: number, userId: string): Promise<void> {
    const titleRow = (
      await this.db.db.select().from(titleTable).where(eq(titleTable.id, titleId))
    )[0];
    if (!titleRow) {
      throw new NotFoundException('称号不存在');
    }
    const target = (
      await this.db.db
        .select({ id: userTable.id, name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, userId))
    )[0];
    if (!target) {
      throw new NotFoundException('用户不存在');
    }
    const existing = (
      await this.db.db
        .select({ id: userTitle.id })
        .from(userTitle)
        .where(and(eq(userTitle.userId, userId), eq(userTitle.titleId, titleId)))
    )[0];
    if (existing) {
      throw new ConflictException('该用户已拥有此称号');
    }
    await this.db.transaction(async (tx) => {
      await tx.insert(userTitle).values({ userId, titleId, grantedBy: actorId });
      await tx.insert(notification).values({
        userId,
        type: 'system',
        actorId,
        message: `你获得了称号「${titleRow.name}」`,
        link: '/forum/growth',
      });
      await tx.insert(moderationLog).values({
        actorId,
        action: 'grant_title',
        targetType: 'user',
        targetId: userId,
        reason: `title=${titleRow.name}`,
      });
    });
  }

  async revokeTitle(actorId: string, titleId: number, userId: string): Promise<void> {
    const deleted = await this.db.db
      .delete(userTitle)
      .where(and(eq(userTitle.userId, userId), eq(userTitle.titleId, titleId)));
    if (this.db.affectedRows(deleted) === 0) {
      throw new NotFoundException('该用户没有此称号');
    }
    await this.log(actorId, 'revoke_title', `user=${userId} title=${titleId}`);
  }

  async reviewTitleApplication(
    actorId: string,
    id: number,
    approve: boolean,
  ): Promise<TitleApplicationSummary> {
    const row = (
      await this.db.db.select().from(titleApplication).where(eq(titleApplication.id, id))
    )[0];
    if (!row) {
      throw new NotFoundException('称号申请不存在');
    }
    if (row.status !== 'pending') {
      throw new ConflictException('该申请已处理');
    }
    const now = new Date();
    let createdTitle: TitleRow | null = null;
    await this.db.transaction(async (tx) => {
      if (approve) {
        const nameTaken = (
          await tx
            .select({ id: titleTable.id })
            .from(titleTable)
            .where(eq(titleTable.name, row.proposedName))
        )[0];
        if (nameTaken) {
          throw new ConflictException('称号名称已被占用，请驳回后让用户重新申请');
        }
        const [inserted] = await this.db.insertReturning(
          titleTable,
          {
            name: row.proposedName,
            kind: 'custom',
            description: row.reason.slice(0, 200),
            color: '#facc15',
            createdBy: actorId,
          },
          tx,
        );
        if (inserted === undefined) {
          throw new Error('Failed to create title.');
        }
        createdTitle = inserted;
        await this.db.insertIgnore(
          userTitle,
          { userId: row.userId, titleId: inserted.id, grantedBy: actorId },
          tx,
        );
      }
      await tx
        .update(titleApplication)
        .set({
          status: approve ? 'approved' : 'rejected',
          resultTitleId: createdTitle?.id ?? null,
          reviewedBy: actorId,
          reviewedAt: now,
        })
        .where(eq(titleApplication.id, id));
      await tx.insert(notification).values({
        userId: row.userId,
        type: 'system',
        actorId,
        message: approve
          ? `你的专属称号「${row.proposedName}」已通过审核`
          : '你的专属称号申请未通过审核',
        link: '/forum/growth',
      });
      await tx.insert(moderationLog).values({
        actorId,
        action: 'review_title_application',
        targetType: 'title_application',
        targetId: String(id),
        reason: approve ? 'approved' : 'rejected',
      });
    });
    const updated = (
      await this.db.db.select().from(titleApplication).where(eq(titleApplication.id, id))
    )[0];
    return await this.toApplicationSummary(updated ?? row);
  }

  private async toApplicationSummary(
    row: typeof titleApplication.$inferSelect,
    userName = '',
  ): Promise<TitleApplicationSummary> {
    const user = (
      await this.db.db
        .select({ name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, row.userId))
    )[0];
    const resultTitle =
      row.resultTitleId === null
        ? null
        : ((
            await this.db.db.select().from(titleTable).where(eq(titleTable.id, row.resultTitleId))
          )[0] ?? null);
    return {
      id: row.id,
      userId: row.userId,
      userName: userName !== '' ? userName : (user?.name ?? ''),
      proposedName: row.proposedName,
      reason: row.reason,
      status: row.status,
      resultTitle: resultTitle ? toTitleSummary(resultTitle) : null,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async log(
    actorId: string,
    action: 'grant_title' | 'revoke_title',
    reason: string,
  ): Promise<void> {
    await this.db.db
      .insert(moderationLog)
      .values({ actorId, action, targetType: 'title', targetId: '0', reason });
  }
}
