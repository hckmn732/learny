#!/usr/bin/env node
// Stops the local stack without deleting any volume (SPEC-008, EF-2, CL-8).
import { COMPOSE_FILE, dockerDiagnostic, loadEnvFiles, run } from './lib.mjs';

loadEnvFiles();

const docker = dockerDiagnostic();
if (docker) {
  console.error(`✖ ${docker}`);
  process.exit(1);
}

let code = 0;
const compose = run('docker', ['compose', '-f', COMPOSE_FILE, 'down', '--remove-orphans']);
if (compose !== 0) {
  console.error('✖ arrêt d’Inngest/Mailpit en échec (docker compose down).');
  code = compose;
}

const supabase = run('supabase', ['stop', '--no-backup']);
if (supabase !== 0) {
  console.error('✖ arrêt de Supabase en échec (supabase stop).');
  code = supabase || 1;
}

if (code === 0) console.log('✔ Pile locale arrêtée ; volumes conservés.');
process.exit(code);
