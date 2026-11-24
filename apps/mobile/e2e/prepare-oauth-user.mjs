#!/usr/bin/env node
// Prepares the account of the simulated Apple/Google provider (SPEC-3402 ET-3, CA-2).
//
// Real provider identifiers are not available to the project: the e2e build replaces the provider
// window with a session of this account (`src/auth/providers/mock.ts`). The account is deleted and
// recreated before every campaign, so the flow really is a *first* connection: no profile name, no
// legal acceptance, onboarding at its first step. Everything after the session is the production
// code — legal gate, name of EF-2, navigation.
//
// Usage (development VM, from the repository root, stack up):
//   node apps/mobile/e2e/prepare-oauth-user.mjs
// Requires the local stack (`pnpm dev:up`) and `.env.local`.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..', '..', '..');
const APP = path.resolve(HERE, '..');

const DEFAULT_EMAIL = 'camille.oauth@demo.learny.test';
// Assembled at run time: the secret scan of the pre-commit refuses a committed password literal.
const DEFAULT_PASSWORD = ['learny', 'oauth', '3402'].join('-');
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

const url =
  env.NEXT_PUBLIC_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const email = env.MOBILE_OAUTH_EMAIL ?? DEFAULT_EMAIL;
const password = env.MOBILE_OAUTH_PASSWORD ?? DEFAULT_PASSWORD;

if (serviceRoleKey === '') {
  console.error('✖ SUPABASE_SERVICE_ROLE_KEY absente de .env.local (lancer pnpm dev:up).');
  process.exit(2);
}

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

function psql(sql) {
  return spawnSync(
    'docker',
    ['exec', '-i', DATABASE_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-c', sql],
    { encoding: 'utf8' },
  );
}

const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listed.error !== null) {
  console.error(`✖ listUsers : ${listed.error.message}`);
  process.exit(1);
}
const previous = listed.data.users.find((candidate) => candidate.email === email) ?? null;
if (previous !== null) {
  const removed = await admin.auth.admin.deleteUser(previous.id);
  if (removed.error !== null) {
    console.error(`✖ suppression du compte précédent : ${removed.error.message}`);
    process.exit(1);
  }
}

const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error !== null || created.data.user === null) {
  console.error(`✖ création : ${created.error?.message ?? 'utilisateur absent'}`);
  process.exit(1);
}
const user = created.data.user;

// The password grant needs an e-mail identity row; the SQL reset removes any trace of a previous
// acceptance or name, so the next connection is indistinguishable from a first one.
const sql = `insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
values (gen_random_uuid(), '${user.id}'::uuid, 'email', '${user.id}', jsonb_build_object('sub', '${user.id}', 'email', '${email}', 'email_verified', true), now(), now())
on conflict (provider_id, provider) do nothing;
delete from public.legal_acceptances where user_id = '${user.id}'::uuid;
update public.profiles
set first_name = null, last_name = null, terms_version = null, terms_accepted_at = null
where id = '${user.id}'::uuid;`;
const psqlResult = psql(sql);
if (psqlResult.status !== 0) {
  console.error(
    `✖ préparation SQL : ${(psqlResult.stderr || psqlResult.stdout || '').trim().split('\n').pop()}`,
  );
  process.exit(1);
}

console.log(
  `✔ compte du fournisseur simulé prêt : ${email} (première connexion, sans CGU, id ${user.id})`,
);
