import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { OAuthController } from './oauth.controller.js';
import { UserProfilesController } from './user-profiles.controller.js';

@Module({
  controllers: [OAuthController, UserProfilesController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
