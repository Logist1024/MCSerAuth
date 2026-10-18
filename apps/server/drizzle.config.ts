import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_URL ?? './data/mcserauth.db';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: path.resolve(process.cwd(), databaseUrl),
  },
  strict: true,
  verbose: true,
});
