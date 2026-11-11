// drizzle-kit configuration (SPEC-101 ET-1, ADR-0111).
// The source of truth is packages/db/migrations; scripts/sync-migrations.mjs copies each file to
// supabase/migrations/2026111100NNNN_<name>.sql with the exact same bytes.
import { defineConfig } from 'drizzle-kit';

import { parseServerEnv } from '@learny/config/server';

const env = parseServerEnv(process.env);
const LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  casing: 'snake_case',
  strict: true,
  verbose: true,
  dbCredentials: { url: env.DATABASE_URL ?? LOCAL_DATABASE_URL },
});
