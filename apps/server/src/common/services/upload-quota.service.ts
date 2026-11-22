import { Injectable } from '@nestjs/common';
import { ErrorCode, type UploadKind } from '@mcserauth/shared';
import { and, eq, lt, sql } from 'drizzle-orm';
import { DbService } from '../../db/db.service.js';
import { uploadUsage } from '../../db/schema/index.js';
import { BusinessException } from '../exceptions/business.exception.js';

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Daily per-user upload counter.
 *
 * The counter is bumped by a single conditional UPDATE (`count < limit`), which
 * is atomic on all three dialects. MySQL has no conditional upsert, so instead
 * of `INSERT ... ON CONFLICT ... WHERE` the row is created with `count = 0`
 * first and then incremented; an update affecting zero rows means the quota is
 * exhausted.
 */
@Injectable()
export class UploadQuotaService {
  constructor(private readonly db: DbService) {}

  async consume(userId: string, kind: UploadKind, dailyLimit: number): Promise<void> {
    const day = utcDay();
    await this.db.insertIgnore(uploadUsage, { userId, kind, day, count: 0 });
    const updated = await this.db.db
      .update(uploadUsage)
      .set({ count: sql`${uploadUsage.count} + 1` })
      .where(
        and(
          eq(uploadUsage.userId, userId),
          eq(uploadUsage.kind, kind),
          eq(uploadUsage.day, day),
          lt(uploadUsage.count, dailyLimit),
        ),
      );

    if (this.db.affectedRows(updated) === 0) {
      throw new BusinessException(
        ErrorCode.UPLOAD_QUOTA_EXCEEDED,
        429,
        `今日上传次数已达上限（${dailyLimit} 次），请明天再试`,
      );
    }
  }

  /**
   * Returns one slot when the caller could not persist the upload after
   * consuming it, so a failed write never burns the user's daily allowance.
   */
  async release(userId: string, kind: UploadKind): Promise<void> {
    const day = utcDay();
    await this.db.db
      .update(uploadUsage)
      .set({
        count: sql`CASE WHEN ${uploadUsage.count} > 0 THEN ${uploadUsage.count} - 1 ELSE 0 END`,
      })
      .where(
        and(eq(uploadUsage.userId, userId), eq(uploadUsage.kind, kind), eq(uploadUsage.day, day)),
      );
  }
}
