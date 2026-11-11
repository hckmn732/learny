#!/usr/bin/env node
/* global AbortSignal */
// Reports one line per local service, then fails if any required service is down (SPEC-008, EF-6).
import fs from 'node:fs';
import path from 'node:path';

import { REQUIRED_EXTENSIONS, ROOT, STACK, loadEnvFiles, runQuiet, serviceUrls } from './lib.mjs';

loadEnvFiles();
const urls = serviceUrls();
const results = [];
let extensionResults = REQUIRED_EXTENSIONS.map((name) => ({ name, ok: false }));

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✖'} ${name} : ${ok ? 'ok' : 'failed'} — ${detail}`);
}

async function httpCheck(name, url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    record(name, response.ok, response.ok ? url : `HTTP ${String(response.status)}`);
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
  }
}

const supabase = runQuiet('supabase', ['status']);
record(
  'supabase',
  supabase.status === 0,
  supabase.status === 0 ? `API ${urls.supabase}` : 'CLI status en échec',
);

const container = `supabase_db_learny`;
const sql = `select extname from pg_extension where extname in (${REQUIRED_EXTENSIONS.map((e) => `'${e}'`).join(',')}) order by extname`;
const query = runQuiet('docker', ['exec', container, 'psql', '-U', 'postgres', '-tAc', sql]);
if (query.status !== 0) {
  record('postgres', false, `psql indisponible dans ${container}`);
} else {
  const found = (query.stdout ?? '').trim().split('\n').filter(Boolean);
  const missing = REQUIRED_EXTENSIONS.filter((extension) => !found.includes(extension));
  extensionResults = REQUIRED_EXTENSIONS.map((name) => ({ name, ok: found.includes(name) }));
  record(
    'postgres',
    missing.length === 0,
    missing.length === 0
      ? `extensions ${found.join(', ')}`
      : `extensions absentes : ${missing.join(', ')}`,
  );
}

await httpCheck('inngest', `${urls.inngest}/health`);
await httpCheck('mailpit', `${urls.mailpit}/api/v1/info`);
await httpCheck('web', `${urls.web}/api/v1/health`);

// Published for the SDD demo page (gitignored cache; never a proof by itself).
try {
  const dir = path.join(ROOT, '.sdd', 'tmp');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'dev-check.json'),
    `${JSON.stringify({ results, extensions: extensionResults }, null, 2)}\n`,
  );
} catch {
  // The demo page is optional; never fail the check because its cache is unwritable.
}

const failed = results.filter((result) => !result.ok);
if (failed.length > 0) {
  console.error(
    `✖ ${String(failed.length)} service(s) en échec : ${failed.map((result) => result.name).join(', ')}`,
  );
  console.error(
    `  Ports attendus : Supabase ${String(STACK.supabaseApi)}/${String(STACK.postgres)}, Inngest ${String(STACK.inngest)}, Mailpit ${String(STACK.mailpitUi)}, web ${String(STACK.web)}.`,
  );
  process.exit(1);
}
console.log('✔ Tous les services locaux sont opérationnels.');
