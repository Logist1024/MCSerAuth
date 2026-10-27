import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ForumModule } from '../forum/forum.module.js';
import { GrowthModule } from '../growth/growth.module.js';
import { ConsoleAuthService } from './console-auth.service.js';
import { ConsoleController } from './console.controller.js';
import { SiteController } from './site.controller.js';
import { SiteService } from './site.service.js';

/** Public site settings, superadmin settings and the key-protected console. */
@Module({
  imports: [AuthModule, ForumModule, GrowthModule],
  controllers: [SiteController, ConsoleController],
  providers: [SiteService, ConsoleAuthService],
  exports: [SiteService],
})
export class SiteModule {}
