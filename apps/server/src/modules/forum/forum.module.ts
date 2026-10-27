import { Module } from '@nestjs/common';
import { UploadQuotaService } from '../../common/services/upload-quota.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { GrowthModule } from '../growth/growth.module.js';
import { ForumController } from './forum.controller.js';
import { ForumUploadsController } from './forum-uploads.controller.js';
import { ForumUploadService } from './forum-upload.service.js';
import { ForumCategoryService } from './forum-category.service.js';
import { ForumService } from './forum.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  imports: [AuthModule, GrowthModule],
  controllers: [ForumController, NotificationsController, ForumUploadsController],
  providers: [
    ForumService,
    ForumCategoryService,
    NotificationsService,
    ForumUploadService,
    UploadQuotaService,
  ],
  exports: [ForumService, NotificationsService],
})
export class ForumModule {}
