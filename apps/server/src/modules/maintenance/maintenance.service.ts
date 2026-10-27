import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, lt } from 'drizzle-orm';
import { DbService } from '../../db/db.service.js';
import {
  banner,
  captchaChallenge,
  gameSession,
  oauthCode,
  session,
  uploadUsage,
} from '../../db/schema/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Hourly retention job for short-lived rows (single-process, no queue). */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(private readonly db: DbService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanup(): Promise<void> {
    const now = Date.now();
    const expiredCodes = this.db.affectedRows(
      await this.db.db.delete(oauthCode).where(lt(oauthCode.expiresAt, new Date(now - DAY_MS))),
    );
    const expiredSessions = this.db.affectedRows(
      await this.db.db.delete(gameSession).where(lt(gameSession.expiresAt, new Date(now - DAY_MS))),
    );
    const expiredAuthSessions = this.db.affectedRows(
      await this.db.db.delete(session).where(lt(session.expiresAt, new Date(now))),
    );
    const oldUsage = this.db.affectedRows(
      await this.db.db
        .delete(uploadUsage)
        .where(lt(uploadUsage.day, new Date(now - 90 * DAY_MS).toISOString().slice(0, 10))),
    );
    const expiredCaptchas = this.db.affectedRows(
      await this.db.db
        .delete(captchaChallenge)
        .where(lt(captchaChallenge.expiresAt, new Date(now - DAY_MS))),
    );
    const expiredBanners = this.db.affectedRows(
      await this.db.db
        .update(banner)
        .set({ status: 'expired' })
        .where(and(eq(banner.status, 'approved'), lt(banner.endsAt, new Date(now)))),
    );

    const total =
      expiredCodes +
      expiredSessions +
      expiredAuthSessions +
      oldUsage +
      expiredCaptchas +
      expiredBanners;
    if (total > 0) {
      this.logger.log(
        `Cleaned ${expiredCodes} oauth codes, ${expiredSessions} game sessions, ` +
          `${expiredAuthSessions} auth sessions, ${oldUsage} upload counters, ` +
          `${expiredCaptchas} captcha challenges, ${expiredBanners} banners`,
      );
    }
  }
}
