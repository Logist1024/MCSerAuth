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
  cleanup(): void {
    const now = Date.now();
    const expiredCodes = this.db.db
      .delete(oauthCode)
      .where(lt(oauthCode.expiresAt, new Date(now - DAY_MS)))
      .run();
    const expiredSessions = this.db.db
      .delete(gameSession)
      .where(lt(gameSession.expiresAt, new Date(now - DAY_MS)))
      .run();
    const expiredAuthSessions = this.db.db
      .delete(session)
      .where(lt(session.expiresAt, new Date(now)))
      .run();
    const oldUsage = this.db.db
      .delete(uploadUsage)
      .where(lt(uploadUsage.day, new Date(now - 90 * DAY_MS).toISOString().slice(0, 10)))
      .run();
    const expiredCaptchas = this.db.db
      .delete(captchaChallenge)
      .where(lt(captchaChallenge.expiresAt, new Date(now - DAY_MS)))
      .run();
    const expiredBanners = this.db.db
      .update(banner)
      .set({ status: 'expired' })
      .where(and(eq(banner.status, 'approved'), lt(banner.endsAt, new Date(now))))
      .run();

    const total =
      expiredCodes.changes +
      expiredSessions.changes +
      expiredAuthSessions.changes +
      oldUsage.changes +
      expiredCaptchas.changes +
      expiredBanners.changes;
    if (total > 0) {
      this.logger.log(
        `Cleaned ${expiredCodes.changes} oauth codes, ${expiredSessions.changes} game sessions, ` +
          `${expiredAuthSessions.changes} auth sessions, ${oldUsage.changes} upload counters, ` +
          `${expiredCaptchas.changes} captcha challenges, ${expiredBanners.changes} banners`,
      );
    }
  }
}
