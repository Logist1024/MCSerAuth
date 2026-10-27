import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ForumModule } from '../forum/forum.module.js';
import { GrowthModule } from '../growth/growth.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { PublicUsersController, UserController } from './user.controller.js';
import { UserService } from './user.service.js';

@Module({
  imports: [AuthModule, ForumModule, ProfilesModule, GrowthModule],
  controllers: [UserController, PublicUsersController],
  providers: [UserService],
})
export class UserModule {}
