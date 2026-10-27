import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/schema/generated/mysql.ts',
  out: './drizzle/mysql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'mysql://root@localhost:3306/mcserauth',
  },
  strict: true,
  verbose: true,
});
