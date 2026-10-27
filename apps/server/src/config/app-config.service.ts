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

  get oauthAccessTokenTtlSeconds(): number {
    return this.value.OAUTH_ACCESS_TOKEN_TTL_SECONDS;
  }

  get oauthRefreshTokenTtlSeconds(): number {
    return this.value.OAUTH_REFRESH_TOKEN_TTL_SECONDS;
  }

  get oauthAuthCodeTtlSeconds(): number {
    return this.value.OAUTH_AUTH_CODE_TTL_SECONDS;
  }

  get sessionJoinTtlSeconds(): number {
    return this.value.SESSION_JOIN_TTL_SECONDS;
  }

  get textureUrlTtlSeconds(): number {
    return this.value.TEXTURE_URL_TTL_SECONDS;
  }

  get databaseUrl(): string {
    return this.value.DATABASE_URL;
  }

  get uploadDir(): string {
    return this.value.UPLOAD_DIR;
  }

  get consoleKey(): string | undefined {
    return this.value.CONSOLE_KEY;
  }

  get consoleSessionTtlSeconds(): number {
    return this.value.CONSOLE_SESSION_TTL_SECONDS;
  }

  get mailProvider(): AppEnv['MAIL_PROVIDER'] {
    return this.value.MAIL_PROVIDER;
  }

  get mailFrom(): string {
    return this.value.MAIL_FROM;
  }

  get smtpHost(): string | undefined {
    return this.value.SMTP_HOST;
  }

  get smtpPort(): number {
    return this.value.SMTP_PORT;
  }

  get smtpUser(): string | undefined {
    return this.value.SMTP_USER;
  }

  get smtpPass(): string | undefined {
    return this.value.SMTP_PASS;
  }
}
