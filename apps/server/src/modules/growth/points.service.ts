import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type AdjustPointsResponse,
  type PointTransactionPage,
  type PointTransactionSummary,
  type TipRequest,
  type TipResponse,
} from '@mcserauth/shared';
import { count, desc, eq, inArray } from 'drizzle-orm';
import { DbService } from '../../db/db.service.js';
import {
  moderationLog,
  notification,
  pointTransaction,
  user as userTable,
  userProgress,
} from '../../db/schema/index.js';
import { RulesService } from './rules.service.js';
import { XpService } from './xp.service.js';
import type { Tx } from './growth.util.js';

/**
 * The points ledger. Every balance mutation appends a point_transaction row
 * so points never change without an audit trail.
 */
@Injectable()
export class PointsService {
  constructor(
    private readonly db: DbService,
    private readonly rulesService: RulesService,
    private readonly xp: XpService,
  ) {}

  async walletsFor(userIds: string[]): Promise<Map<string, number>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) {
      return new Map();
    }
    return new Map(
      (
        await this.db.db
          .select({ userId: userProgress.userId, points: userProgress.points })
          .from(userProgress)
          .where(inArray(userProgress.userId, unique))
      ).map((row) => [row.userId, row.points]),
    );
  }

  async tip(fromUserId: string, input: TipRequest): Promise<TipResponse> {
    if (input.userId === fromUserId) {
      throw new BadRequestException('不能打赏自己');
    }
    const amount = Math.floor(input.amount);
    const rules = await this.rulesService.rules();
    if (amount < rules.tipMin || amount > rules.tipMax) {
      throw new BadRequestException(`打赏积分需要在 ${rules.tipMin}–${rules.tipMax} 之间`);
    }
    const recipient = (
      await this.db.db
        .select({ id: userTable.id, name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, input.userId))
    )[0];
    if (!recipient) {
      throw new NotFoundException('被打赏的用户不存在');
    }
    const sender = (
      await this.db.db
        .select({ id: userTable.id, name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, fromUserId))
    )[0];
    const senderRow = await this.xp.ensure(fromUserId);
    if (senderRow.points < amount) {
      throw new BadRequestException(`积分不足（当前 ${senderRow.points}）`);
    }
    const recipientRow = await this.xp.ensure(recipient.id);
    await this.db.transaction(async (tx) => {
      const senderBalance = await this.applyPoints(
        tx,
        fromUserId,
        -amount,
        senderRow.points,
        'tip_out',
        {
          memo: input.memo ?? `打赏给 ${recipient.name}`,
          refId: recipient.id,
        },
      );
      await tx
        .update(userProgress)
        .set({ points: senderBalance, updatedAt: new Date() })
        .where(eq(userProgress.userId, fromUserId));
      const recipientBalance = await this.applyPoints(
        tx,
        recipient.id,
        amount,
        recipientRow.points,
        'tip_in',
        { memo: input.memo ?? `来自 ${sender?.name ?? '社区成员'} 的打赏`, refId: fromUserId },
      );
      await tx
        .update(userProgress)
        .set({ points: recipientBalance, updatedAt: new Date() })
        .where(eq(userProgress.userId, recipient.id));
      await tx.insert(notification).values({
        userId: recipient.id,
        type: 'system',
        actorId: fromUserId,
        message: `${sender?.name ?? '社区成员'} 打赏了你 ${amount} 积分`,
        link: '/forum/growth',
      });
    });
    const recipientAfter = await this.xp.summary(recipient.id);
    return {
      progress: await this.xp.summary(fromUserId),
      recipient: { userId: recipient.id, name: recipient.name, points: recipientAfter.points },
    };
  }

  async listTransactions(userId: string, page = 1, pageSize = 20): Promise<PointTransactionPage> {
    const safePage = Math.max(1, page);
    const safeSize = Math.min(50, Math.max(1, pageSize));
    const rows = await this.db.db
      .select()
      .from(pointTransaction)
      .where(eq(pointTransaction.userId, userId))
      .orderBy(desc(pointTransaction.createdAt), desc(pointTransaction.id))
      .limit(safeSize)
      .offset((safePage - 1) * safeSize);
    const total = (
      await this.db.db
        .select({ value: count() })
        .from(pointTransaction)
        .where(eq(pointTransaction.userId, userId))
    )[0];
    return {
      items: rows.map((row) => this.toTransaction(row)),
      total: total?.value ?? 0,
      page: safePage,
      pageSize: safeSize,
    };
  }

  async adjustPoints(
    actorId: string,
    userId: string,
    amount: number,
    memo?: string,
  ): Promise<AdjustPointsResponse> {
    if (!Number.isInteger(amount) || amount === 0) {
      throw new BadRequestException('积分调整必须是非零整数');
    }
    if (Math.abs(amount) > 100000) {
      throw new BadRequestException('单次积分调整不能超过 100000');
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
    const row = await this.xp.ensure(userId);
    if (row.points + amount < 0) {
      throw new BadRequestException('扣减后积分不能为负数');
    }
    const created = await this.db.transaction(async (tx) => {
      const balance = await this.applyPoints(tx, userId, amount, row.points, 'admin_adjust', {
        memo: memo ?? '管理员调整',
        refId: actorId,
      });
      await tx
        .update(userProgress)
        .set({ points: balance, updatedAt: new Date() })
        .where(eq(userProgress.userId, userId));
      await tx.insert(notification).values({
        userId,
        type: 'system',
        actorId,
        message:
          amount > 0 ? `管理员向你赠送了 ${amount} 积分` : `管理员扣除了 ${Math.abs(amount)} 积分`,
        link: '/forum/growth',
      });
      await tx.insert(moderationLog).values({
        actorId,
        action: 'adjust_points',
        targetType: 'user',
        targetId: userId,
        reason: `${amount > 0 ? '+' : ''}${amount}${memo ? ` ${memo}` : ''}`,
      });
      return (
        await tx
          .select()
          .from(pointTransaction)
          .where(eq(pointTransaction.userId, userId))
          .orderBy(desc(pointTransaction.id))
          .limit(1)
      )[0];
    });
    return {
      userId,
      points: (await this.xp.ensure(userId)).points,
      transaction: created
        ? this.toTransaction(created)
        : {
            id: 0,
            amount,
            balanceAfter: row.points + amount,
            reason: 'admin_adjust',
            memo: memo ?? null,
            createdAt: new Date().toISOString(),
          },
    };
  }

  async applyPoints(
    tx: Tx,
    userId: string,
    amount: number,
    currentBalance: number,
    reason: PointTransactionSummary['reason'],
    extra: {
      memo?: string;
      refId?: string;
    } = {},
  ): Promise<number> {
    const balanceAfter = currentBalance + amount;
    if (balanceAfter < 0) {
      throw new BadRequestException('积分不足');
    }
    await tx.insert(pointTransaction).values({
      userId,
      amount,
      balanceAfter,
      reason,
      memo: extra.memo ?? null,
      refId: extra.refId ?? null,
    });
    return balanceAfter;
  }

  private toTransaction(row: typeof pointTransaction.$inferSelect): PointTransactionSummary {
    return {
      id: row.id,
      amount: row.amount,
      balanceAfter: row.balanceAfter,
      reason: row.reason,
      memo: row.memo,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
