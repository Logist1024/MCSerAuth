import { Injectable } from '@nestjs/common';
import { ErrorCode, type UploadKind } from '@mcserauth/shared';
import { lt, sql } from 'drizzle-orm';
import { DbService } from '../../db/db.service.js';
import { uploadUsage } from '../../db/schema/index.js';
import { BusinessException } from '../exceptions/business.exception.js';

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Daily per-user upload counter. The check and increment run in one statement
 * (UPSERT with `count + 1`) so concurrent uploads cannot exceed the limit.
 */
@Injectable()
export class UploadQuotaService {
  constructor(private readonly db: DbService) {}

  consume(userId: string, kind: UploadKind, dailyLimit: number): void {
    const day = utcDay();
    const updated = this.db.db
      .insert(uploadUsage)
      .values({ userId, kind, day, count: 1 })
      .onConflictDoUpdate({
        target: [uploadUsage.userId, uploadUsage.kind, uploadUsage.day],
        set: { count: sql`${uploadUsage.count} + 1` },
        setWhere: lt(uploadUsage.count, dailyLimit),
      })
      .returning({ count: uploadUsage.count })
      .get();

    if (updated === undefined) {
      throw new BusinessException(
        ErrorCode.UPLOAD_QUOTA_EXCEEDED,
        429,
        `今日上传次数已达上限（${dailyLimit} 次），请明天再试`,
      );
    }
  }
}
