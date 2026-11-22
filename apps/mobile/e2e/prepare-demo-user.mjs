#!/usr/bin/env node
// Prepares the demonstration account of the mobile e2e campaign (SPEC-3003 EF-9, CA-1).
//
// The SPEC-115 seed inserts `auth.users` directly: the account has no password and no e-mail
// identity, so a password grant would be refused. This script gives it the password of
// `apps/mobile/e2e/e2e.env` (`MOBILE_DEMO_PASSWORD`, never printed) and completes the identity,
// exactly like `createDemoSession` of `@learny/testing` does for the web suite.
//
// Usage (development VM, from the repository root):
//   node apps/mobile/e2e/prepare-demo-user.mjs
// Requires the local stack (`pnpm dev:up`, `pnpm db:seed:demo`) and `.env.local`.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..', '..', '..');
const APP = path.resolve(HERE, '..');

const DEFAULT_EMAIL = 'alex.perrin@demo.learny.test';
const DEFAULT_PASSWORD = 'learny-demo-3003';
const DATABASE_CONTAINER = 'supabase_db_learny';

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) out[match[1]] = match[2];
  }
  return out;
}

const localEnv = readEnvFile(path.join(ROOT, '.env.local'));
const e2eEnv = readEnvFile(path.join(APP, 'e2e', 'e2e.env'));
const env = { ...localEnv, ...e2eEnv, ...process.env };

const url = env.NEXT_PUBLIC_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const email = env.MOBILE_DEMO_EMAIL ?? DEFAULT_EMAIL;
const password = env.MOBILE_DEMO_PASSWORD ?? DEFAULT_PASSWORD;

if (serviceRoleKey === '') {
  console.error('✖ SUPABASE_SERVICE_ROLE_KEY absente de .env.local (lancer pnpm dev:up).');
  process.exit(2);
}

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listed.error !== null) {
  console.error(`✖ listUsers : ${listed.error.message}`);
  process.exit(1);
}
const user =
  listed.data.users.find((candidate) => candidate.email === email) ??
  (
    await admin.auth.admin.createUser({ email, password, email_confirm: true })
  ).data?.user;

if (user === undefined) {
  console.error(`✖ compte de démonstration introuvable : ${email}`);
  process.exit(1);
}

const updated = await admin.auth.admin.updateUserById(user.id, {
  password,
  email_confirm: true,
});
if (updated.error !== null) {
  console.error(`✖ updateUserById : ${updated.error.message}`);
  process.exit(1);
}

// The seed writes `auth.users` without an identity row; the password grant needs one.
const sql = `insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
values (gen_random_uuid(), '${user.id}'::uuid, 'email', '${user.id}', jsonb_build_object('sub', '${user.id}', 'email', '${email}', 'email_verified', true), now(), now())
on conflict (provider_id, provider) do nothing;`;
const psql = spawnSync(
  'docker',
  ['exec', '-i', DATABASE_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', sql],
  { encoding: 'utf8' },
);
if (psql.status !== 0) {
  console.error(
    `✖ identité e-mail non complétée : ${(psql.stderr || psql.stdout || '').trim().split('\n').pop()}`,
  );
  process.exit(1);
}

console.log(`✔ compte de démonstration prêt : ${email} (mot de passe non affiché, id ${user.id})`);
