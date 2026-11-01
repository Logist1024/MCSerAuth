import 'reflect-metadata';
import { Logger } from 'nestjs-pino';
import { createServerApp } from './http/server.factory.js';
import { AppConfigService } from './config/app-config.service.js';

// Timestamps are stored as UTC wall-clock values in every dialect. Pinning the
// process time zone keeps node-postgres from interpreting `timestamp` columns
// in the host's local zone.
process.env.TZ = 'UTC';

async function bootstrap(): Promise<void> {
  const app = await createServerApp();
  const config = app.get(AppConfigService);
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
