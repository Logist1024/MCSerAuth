import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module.js';
import { AppConfigService } from './config/app-config.service.js';
import { buildPinoParams } from './common/logger/pino.config.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { OriginGuard } from './common/guards/origin.guard.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';
import { DbModule } from './db/db.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CaptchaModule } from './modules/captcha/captcha.module.js';
import { ForumModule } from './modules/forum/forum.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MaintenanceModule } from './modules/maintenance/maintenance.module.js';
import { ProfilesModule } from './modules/profiles/profiles.module.js';
import { SessionModule } from './modules/session/session.module.js';
import { SiteModule } from './modules/site/site.module.js';
import { UserModule } from './modules/user/user.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => buildPinoParams(config),
    }),
    DbModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    HealthModule,
    CaptchaModule,
    AuthModule,
    SessionModule,
    ProfilesModule,
    ForumModule,
    UserModule,
    AdminModule,
    SiteModule,
    MaintenanceModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: OriginGuard },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        transform: true,
        // Protocol clients may send extra fields; strip them instead of rejecting.
        forbidNonWhitelisted: false,
      }),
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
