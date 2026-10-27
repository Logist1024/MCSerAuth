import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import path from 'node:path';

const databaseUrl = process.env.DATABASE_URL ?? './data/mcserauth.db';

/** Normalizes the SQLite URL forms accepted by DATABASE_URL into a file path. */
function sqliteFilePath(url: string): string {
  const value = url.trim();
  if (value.startsWith('sqlite://')) {
    return new URL(value).pathname;
  }
  if (value.startsWith('sqlite:')) {
    return value.slice('sqlite:'.length);
  }
  if (value.startsWith('file://')) {
    return new URL(value).pathname;
  }
  if (value.startsWith('file:')) {
    return value.slice('file:'.length);
  }
  return value;
}

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema/generated/sqlite.ts',
  out: './drizzle/sqlite',
  dbCredentials: {
    url: path.resolve(process.cwd(), sqliteFilePath(databaseUrl)),
  },
  strict: true,
  verbose: true,
});
