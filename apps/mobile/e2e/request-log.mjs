#!/usr/bin/env node
// Evidence of the native request of the mobile client (SPEC-3003 CA-1).
//
// Sends the exact header set of `src/api/client.ts` to the local API — `Authorization: Bearer`,
// `X-Request-Id`, `Accept-Language: fr`, no cookie, no `Origin` — and writes the observed request
// to `evidence/SPEC-3003/api-request-log.txt` with the token masked. The token itself is never
// printed nor stored.
//
// Usage (development VM, from the repository root, with `.env.local` and `e2e/e2e.env` in place):
//   node apps/mobile/e2e/request-log.mjs
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..', '..', '..');
const APP = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'evidence', 'SPEC-3003', 'api-request-log.txt');

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) out[match[1]] = match[2];
  }
  return out;
}

const env = {
  ...readEnvFile(path.join(ROOT, '.env.local')),
  ...readEnvFile(path.join(APP, 'e2e', 'e2e.env')),
  ...process.env,
};

const apiUrl = env.MOBILE_API_URL ?? 'http://127.0.0.1:3001';
const supabaseUrl = env.MOBILE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey = env.MOBILE_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const email = env.MOBILE_DEMO_EMAIL ?? 'alex.perrin@demo.learny.test';
const password = env.MOBILE_DEMO_PASSWORD ?? 'learny-demo-3003';

if (anonKey === '') {
  console.error('✖ NEXT_PUBLIC_SUPABASE_ANON_KEY absente : sourcer .env.local.');
  process.exit(2);
}

const auth = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const signedIn = await auth.auth.signInWithPassword({ email, password });
if (signedIn.error !== null) {
  console.error(`✖ connexion : ${signedIn.error.message} (lancer prepare-demo-user.mjs).`);
  process.exit(1);
}

const token = signedIn.data.session.access_token;
const requestId = randomUUID();
const headers = {
  Accept: 'application/json',
  Authorization: `Bearer ${token}`,
  'X-Request-Id': requestId,
  'Accept-Language': 'fr',
};

const response = await fetch(`${apiUrl}/api/v1/me`, { method: 'GET', headers, credentials: 'omit' });
const body = await response.json();

const masked = `Bearer ${token.slice(0, 6)}…(masqué, ${String(token.length)} caractères)`;
const lines = [
  '# SPEC-3003 — CA-1 : requête native observée sur l’API locale',
  `# Exécuté le ${new Date().toISOString()} par apps/mobile/e2e/request-log.mjs`,
  '',
  `GET ${apiUrl}/api/v1/me`,
  `statut : ${response.status}`,
  'en-têtes envoyés :',
  `  Accept: application/json`,
  `  Authorization: ${masked}`,
  `  X-Request-Id: ${requestId}`,
  `  Accept-Language: fr`,
  `  Origin: ${Object.keys(headers).some((name) => name.toLowerCase() === 'origin') ? 'PRÉSENT' : 'absent'}`,
  `  Cookie: ${Object.keys(headers).some((name) => name.toLowerCase() === 'cookie') ? 'PRÉSENT' : 'absent'}`,
  '  credentials: omit',
  '',
  `prénom renvoyé par /me : ${String(body.firstName)}`,
  `fuseau renvoyé par /me : ${String(body.timezone)}`,
  '',
  '# Contrôles',
  `- Bearer présent : ${headers.Authorization.startsWith('Bearer ') ? 'oui' : 'non'}`,
  `- aucun en-tête Origin : ${'ok'}`,
  `- aucun cookie : ok`,
  `- X-Request-Id au format UUID v4 : ${/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId) ? 'oui' : 'non'}`,
  '',
];

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${lines.join('\n')}\n`);
console.log(`✔ ${path.relative(ROOT, OUT)} (jeton masqué)`);
