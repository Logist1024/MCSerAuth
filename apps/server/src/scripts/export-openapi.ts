import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AppModule } from '../app.module.js';
import { createOpenApiDocument } from '../swagger.js';

/**
 * Produces docs/openapi.json from the live application metadata.
 * Run with `pnpm openapi:export` (compiles first, then executes this script).
 */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: false });
  app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] });
  await app.init();

  const document = createOpenApiDocument(app);
  const outFile = path.resolve(process.cwd(), '../../docs/openapi.json');
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  await app.close();
  console.log(`OpenAPI document written to ${outFile}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
