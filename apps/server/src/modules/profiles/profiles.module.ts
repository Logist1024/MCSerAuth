import { Module } from '@nestjs/common';
import { MinecraftProfileController } from './minecraft-profile.controller.js';
import { ProfilesController } from './profiles.controller.js';

@Module({
  controllers: [ProfilesController, MinecraftProfileController],
})
export class ProfilesModule {}
