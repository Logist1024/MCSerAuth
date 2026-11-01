import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BannersService } from './banners.service.js';
import { CheckinService } from './checkin.service.js';
import { GrowthController } from './growth.controller.js';
import { LeaderboardService } from './leaderboard.service.js';
import { PointsService } from './points.service.js';
import { ProgressService } from './progress.service.js';
import { RulesService } from './rules.service.js';
import { ShopService } from './shop.service.js';
import { TitlesService } from './titles.service.js';
import { XpService } from './xp.service.js';

/**
 * Growth economy domain. Exported so forum authors can show level badges and
 * texture uploads can enforce the cape unlock.
 */
@Module({
  imports: [AuthModule],
  controllers: [GrowthController],
  providers: [
    BannersService,
    CheckinService,
    LeaderboardService,
    PointsService,
    ProgressService,
    RulesService,
    ShopService,
    TitlesService,
    XpService,
  ],
  exports: [ProgressService],
})
export class GrowthModule {}
