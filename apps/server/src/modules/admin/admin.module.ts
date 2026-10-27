import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CaptchaModule } from '../captcha/captcha.module.js';
import { ForumModule } from '../forum/forum.module.js';
import { GrowthModule } from '../growth/growth.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { AdminSiteController } from '../site/admin-site.controller.js';
import { SiteModule } from '../site/site.module.js';
import { AdminAccessService } from './admin-access.service.js';
import { AdminCaptchaController } from './admin-captcha.controller.js';
import { AdminForumController } from './admin-forum.controller.js';
import { AdminForumService } from './admin-forum.service.js';
import { AdminGrowthController } from './admin-growth.controller.js';
import { AdminPermissionsController } from './admin-permissions.controller.js';
import { AdminServersController } from './admin-servers.controller.js';
import { AdminServersService } from './admin-servers.service.js';
import { AdminTexturesController } from './admin-textures.controller.js';

/**
 * Admin & moderation island: server allow-list, texture review and the forum
 * user/report/content/category/announcement tools.
 */
@Module({
  imports: [AuthModule, CaptchaModule, ProfilesModule, ForumModule, GrowthModule, SiteModule],
  controllers: [
    AdminServersController,
    AdminTexturesController,
    AdminForumController,
    AdminGrowthController,
    AdminPermissionsController,
    AdminCaptchaController,
    AdminSiteController,
  ],
  providers: [AdminAccessService, AdminServersService, AdminForumService],
})
export class AdminModule {}
