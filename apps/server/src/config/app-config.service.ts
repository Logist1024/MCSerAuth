import { Injectable } from '@nestjs/common';
import { type AppEnv, validateEnv } from './env.js';

/**
 * Typed access to the validated environment.
 *
 * The object is parsed from `process.env` (already populated by
 * ConfigModule.forRoot's dotenv loader); ConfigModule performs the same
 * validation at bootstrap for fail-fast behaviour, and this service exposes the
 * strongly typed result to the rest of the app.
 */
@Injectable()
export class AppConfigService {
  private readonly value: AppEnv = validateEnv(process.env);

  get env(): AppEnv {
    return this.value;
  }

  get nodeEnv(): AppEnv['NODE_ENV'] {
    return this.value.NODE_ENV;
  }

  get isProduction(): boolean {
    return this.value.NODE_ENV === 'production';
  }

  get port(): number {
    return this.value.PORT;
  }

  get logLevel(): AppEnv['LOG_LEVEL'] {
    return this.value.LOG_LEVEL;
  }

  get appUrl(): string {
    return this.value.APP_URL;
  }

  get authUrl(): string {
    return this.value.AUTH_URL;
  }

  get cookieSecure(): boolean {
    return this.value.COOKIE_SECURE;
  }

  get betterAuthSecret(): string {
    return this.value.BETTER_AUTH_SECRET;
  }

  get databaseUrl(): string {
    return this.value.DATABASE_URL;
  }

  get uploadDir(): string {
    return this.value.UPLOAD_DIR;
  }
}
