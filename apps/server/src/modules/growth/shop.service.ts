import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { PurchaseRequest, PurchaseResponse } from '@mcserauth/shared';
import { eq } from 'drizzle-orm';
import { DbService } from '../../db/db.service.js';
import { banner as bannerTable, user as userTable, userProgress } from '../../db/schema/index.js';
import { RulesService } from './rules.service.js';
import { XpService } from './xp.service.js';
import { PointsService } from './points.service.js';
import { clampText, lockProgressRow, toBannerSummary } from './growth.util.js';

/** Point-shop purchases: XP boost, permanent cape unlock and banner slots. */
@Injectable()
export class ShopService {
  constructor(
    private readonly db: DbService,
    private readonly rulesService: RulesService,
    private readonly xp: XpService,
    private readonly points: PointsService,
  ) {}

  async purchase(
    userId: string,
    input: PurchaseRequest,
    now = new Date(),
  ): Promise<PurchaseResponse> {
    const rules = await this.rulesService.rules();
    const item = (await this.rulesService.shopItems()).find((entry) => entry.key === input.item);
    if (!item) {
      throw new BadRequestException('商品不存在');
    }
    const title = input.bannerTitle?.trim() ?? '';
    const href = input.bannerHref?.trim() ?? '';
    if (item.key === 'banner') {
      if (title.length < 2 || title.length > 40) {
        throw new BadRequestException('Banner 标题需要 2–40 个字符');
      }
      if (href !== '' && !/^https?:\/\//i.test(href)) {
        throw new BadRequestException('Banner 链接必须以 http:// 或 https:// 开头');
      }
    }
    const description = clampText(input.bannerDescription, 120);
    await this.xp.ensure(userId);
    const outcome = await this.db.transaction(async (tx) => {
      // Balance, unlock state and boost expiry all come from the locked row, so
      // two concurrent purchases cannot both spend the same points.
      const row = await lockProgressRow(this.db, tx, userId);
      if (row.points < item.price) {
        throw new BadRequestException(`积分不足，需要 ${item.price} 积分（当前 ${row.points}）`);
      }
      if (item.key === 'xp_boost') {
        const base =
          row.xpBoostUntil !== null && row.xpBoostUntil.getTime() > now.getTime()
            ? row.xpBoostUntil
            : now;
        const until = new Date(base.getTime() + rules.xpBoostHours * 60 * 60 * 1000);
        await this.points.applyPoints(tx, userId, -item.price, 'xp_boost', {
          memo: `经验翻倍卡 ${rules.xpBoostHours} 小时`,
        });
        await tx
          .update(userProgress)
          .set({ xpBoostUntil: until, updatedAt: now })
          .where(eq(userProgress.userId, userId));
        return {
          message: `经验翻倍已生效，持续到 ${until.toLocaleString('zh-CN', { hour12: false })}`,
          banner: null,
        };
      }
      if (item.key === 'cape_unlock') {
        if (row.capeUnlockedAt !== null) {
          throw new ConflictException('披风功能已经解锁');
        }
        await this.points.applyPoints(tx, userId, -item.price, 'cape_unlock', {
          memo: '永久解锁披风功能',
        });
        await tx
          .update(userProgress)
          .set({ capeUnlockedAt: now, updatedAt: now })
          .where(eq(userProgress.userId, userId));
        return { message: '披风功能已解锁，前往游戏账号管理上传披风吧', banner: null };
      }
      await this.points.applyPoints(tx, userId, -item.price, 'banner', {
        memo: `Banner 申请：${title}`,
      });
      const [inserted] = await this.db.insertReturning(
        bannerTable,
        {
          userId,
          title,
          description,
          href: href === '' ? null : href,
          status: 'pending',
          pointsSpent: item.price,
        },
        tx,
      );
      if (inserted === undefined) {
        throw new Error('Failed to create banner application.');
      }
      return { message: 'Banner 申请已提交，审核通过后会在首页展示', banner: inserted };
    });
    const owner = (
      await this.db.db
        .select({ name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, userId))
    )[0];
    return {
      progress: await this.xp.summary(userId, now),
      message: outcome.message,
      banner: outcome.banner === null ? null : toBannerSummary(outcome.banner, owner?.name ?? ''),
    };
  }
}
