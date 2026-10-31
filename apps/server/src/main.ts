import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import {
  json,
  urlencoded,
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { AppModule } from './app.module.js';
import { PREFIX_EXCLUDED_ROUTES } from './app.constants.js';
import { docsCsp, generateCspNonce, isDocsPath, strictCsp, CSP_NONCE_KEY } from './common/csp.js';
import { AppConfigService } from './config/app-config.service.js';
import { AuthService } from './modules/auth/auth.service.js';
import { setupSwagger } from './swagger.js';

// Timestamps are stored as UTC wall-clock values in every dialect. Pinning the
// process time zone keeps node-postgres from interpreting `timestamp` columns
// in the host's local zone.
process.env.TZ = 'UTC';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false, bufferLogs: true });
  const config = app.get(AppConfigService);
  const auth = app.get(AuthService);
  app.useLogger(app.get(Logger));
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.set('trust proxy', 1);
  app.enableCors({ origin: [config.appUrl, config.authUrl], credentials: true });
  app.use(
    helmet({
      // CSP is set per request below: the OAuth entry pages need a fresh nonce
      // for their inline styles/script, which helmet's static config can't do.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  // Per-request CSP (src/common/csp.ts): strict nonce-based policy for the
  // HTML this server renders, a relaxed one for swagger-ui's inline bootstrap.
  app.use((request: Request, response: Response, next: NextFunction): void => {
    const nonce = generateCspNonce();
    response.locals[CSP_NONCE_KEY] = nonce;
    response.setHeader(
      'Content-Security-Policy',
      isDocsPath(request.path) ? docsCsp() : strictCsp(nonce),
    );
    next();
  });
  const tooManyRequests = (
    _request: Request,
    response: Response,
    _next: NextFunction,
    _options: unknown,
  ): void => {
    response.status(429).json({ message: '请求过于频繁，请稍后再试' });
  };
  const authBurstLimiter = rateLimit({
    windowMs: 60000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: tooManyRequests,
  });
  const credentialLimiter = rateLimit({
    windowMs: 60000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: tooManyRequests,
  });
  // better-auth owns /api/auth/*. It must run before the JSON parser because it
  // consumes the raw request stream itself.
  // Credential endpoints get a tighter burst limit; all auth routes share a
  // coarse per-IP ceiling. In-memory counters are sufficient for one process.
  app.use('/api/auth/sign-in/email', credentialLimiter);
  app.use('/api/auth/sign-up/email', credentialLimiter);
  app.use('/api/auth/request-password-reset', credentialLimiter);
  app.use('/api/auth/reset-password', credentialLimiter);
  app.use('/api/auth', authBurstLimiter);
  const authHandler = auth.handler;
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/api/auth' || req.path.startsWith('/api/auth/')) {
      await authHandler(req, res).catch((error: unknown) => {
        next(error);
      });
      return;
    }
    next();
  });
  // Nest's built-in body parser is disabled so the mount above can win; every
  // other route gets the parsers here, before Nest's router runs.
  const jsonParser = json({ limit: '1mb' });
  const urlencodedParser = urlencoded({ extended: true, limit: '1mb' });
  app.use((req: Request, res: Response, next: NextFunction) => {
    jsonParser(req, res, (error?: unknown) => {
      if (error) {
        next(error);
        return;
      }
      urlencodedParser(req, res, next);
    });
  });
  app.setGlobalPrefix('api', { exclude: PREFIX_EXCLUDED_ROUTES });
  setupSwagger(app);
  app.enableShutdownHooks();
  await app.listen(config.port);
  app
    .get(Logger)
    .log(`MCSerAuth server ready at ${config.authUrl} — API under /api, OpenAPI at /docs`);
}
await bootstrap().catch((error: unknown) => {
  // Bootstrap failures may happen before the pino logger exists.
  console.error(error);
  process.exitCode = 1;
});
