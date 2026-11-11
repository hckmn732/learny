#!/usr/bin/env node
// Starts the local stack: Supabase (CLI) then Inngest and Mailpit (Compose) (SPEC-008, EF-1).
import {
  COMPOSE_FILE,
  dockerDiagnostic,
  loadEnvFiles,
  run,
  serviceUrls,
  supabaseDiagnostic,
  waitForHttp,
} from './lib.mjs';

loadEnvFiles();

const docker = dockerDiagnostic();
if (docker) {
  console.error(`✖ ${docker}`);
  process.exit(1);
}
const supabase = supabaseDiagnostic();
if (supabase) {
  console.error(`✖ ${supabase}`);
  process.exit(1);
}

console.log('→ Supabase local (idempotent, les volumes sont conservés)');
const supabaseCode = run('supabase', ['start']);
if (supabaseCode !== 0) {
  console.error('✖ supabase start a échoué. Vérifiez les ports de supabase/config.toml.');
  process.exit(supabaseCode);
}

console.log('→ Inngest Dev Server et Mailpit (docker compose)');
const composeCode = run('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', '--wait']);
if (composeCode !== 0) {
  console.error('✖ docker compose a échoué. Vérifiez les ports 8288, 1025 et 8025.');
  process.exit(composeCode);
}

const urls = serviceUrls();
try {
  await waitForHttp(`${urls.inngest}/health`);
  await waitForHttp(`${urls.mailpit}/api/v1/info`);
} catch (error) {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

console.log('✔ Pile locale prête (aucune donnée supprimée)');
console.log(`  Supabase API  ${urls.supabase}`);
console.log(`  Postgres      ${urls.postgres}`);
console.log(`  Inngest       ${urls.inngest}`);
console.log(`  Mailpit       ${urls.mailpit} (SMTP 127.0.0.1:1025)`);
console.log(`  Web           ${urls.web}`);
