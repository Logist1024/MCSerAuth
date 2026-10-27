import { Module } from '@nestjs/common';
import { UploadQuotaService } from '../../common/services/upload-quota.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { GrowthModule } from '../growth/growth.module.js';
import { InjectorProfilesController } from './injector-profiles.controller.js';
import { MinecraftProfileController } from './minecraft-profile.controller.js';
import { PlayerContextService } from './player-context.service.js';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesService } from './profiles.service.js';
import { TextureService } from './texture.service.js';

@Module({
  imports: [AuthModule, GrowthModule],
  controllers: [ProfilesController, MinecraftProfileController, InjectorProfilesController],
  providers: [ProfilesService, TextureService, PlayerContextService, UploadQuotaService],
  exports: [TextureService, ProfilesService],
})
export class ProfilesModule {}
