import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { SessionController } from './session.controller.js';
import { SessionService } from './session.service.js';
import { YggdrasilSessionController } from './yggdrasil-session.controller.js';

@Module({
  imports: [AuthModule, ProfilesModule],
  controllers: [SessionController, YggdrasilSessionController],
  providers: [SessionService],
})
export class SessionModule {}
