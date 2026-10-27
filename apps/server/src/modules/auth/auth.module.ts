import { Module } from '@nestjs/common';
import { CaptchaModule } from '../captcha/captcha.module.js';
import { MailModule } from '../mail/mail.module.js';
import { AccountAccessService } from './account-access.service.js';
import { AuthService } from './auth.service.js';
import { NicknameReservationService } from './nickname-reservation.service.js';
import { OAuthController } from './oauth.controller.js';
import { OAuthService } from './oauth.service.js';
import { UserProfilesController } from './user-profiles.controller.js';
import { YggdrasilAuthController, YggdrasilMetadataController } from './yggdrasil.controller.js';
import { YggdrasilService } from './yggdrasil.service.js';

@Module({
  imports: [CaptchaModule, MailModule],
  controllers: [
    OAuthController,
    UserProfilesController,
    YggdrasilMetadataController,
    YggdrasilAuthController,
  ],
  providers: [
    AuthService,
    AccountAccessService,
    OAuthService,
    YggdrasilService,
    NicknameReservationService,
  ],
  exports: [AuthService, AccountAccessService, OAuthService, NicknameReservationService],
})
export class AuthModule {}
