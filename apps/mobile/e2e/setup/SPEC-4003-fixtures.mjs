#!/usr/bin/env node
// Fixtures of the SPEC-4003 Maestro campaign (setup executed by `run-maestro.mjs` before flows).
//
// Pushes two real PDFs (a course with bookmarks and a TD) into the emulator Downloads, so the
// native document picker and the share intent read actual documents. Idempotent.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SDK = process.env.ANDROID_SDK_ROOT ?? process.env.ANDROID_HOME ?? '/opt/android-sdk';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', '..');

/** Lit un fichier `KEY=value` (mêmes règles que le lanceur). */
function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) out[match[1]] = match[2];
  }
  return out;
}

const env = {
  ...readEnv(path.join(ROOT, '.env.local')),
  ...readEnv(path.join(ROOT, 'apps', 'mobile', 'e2e', 'e2e.env')),
  ...process.env,
};
const adb = process.env.ADB ?? path.join(SDK, 'platform-tools', 'adb');

function run(args) {
  return spawnSync(adb, args, { encoding: 'utf8', timeout: 60_000 });
}

/** Minimal valid PDF (text only) so the picker and the extractor read a real document. */
function pdf(kind) {
  const file = path.join(os.tmpdir(), `SPEC-4003-${kind}.pdf`);
  if (fs.existsSync(file)) return file;
  const pages = kind === 'manuel' ? 12 : 4;
  const objects = [];
  const pageIds = Array.from({ length: pages }, (_, index) => 4 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${String(id)} 0 R`).join(' ')}] /Count ${String(pages)} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  for (let index = 0; index < pages; index += 1) {
    const pageId = 4 + index * 2;
    const contentId = pageId + 1;
    const title =
      kind === 'manuel'
        ? `Chapitre ${String(index + 1)} : comptabilite generale`
        : `TD corrige ${String(index + 1)}`;
    const lines = Array.from(
      { length: 10 },
      (_, line) =>
        `(${kind === 'manuel' ? `Section ${String(index + 1)}.${String(line + 1)} : le plan comptable et les operations courantes.` : 'Exercice : enregistrer une facture d achat de marchandises.'}) Tj 0 -22 Td`,
    ).join('\n');
    const content = `BT /F1 18 Tf 72 760 Td (${title}) Tj 0 -30 Td /F1 11 Tf\n${lines}\nET`;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${String(contentId)} 0 R >>`;
    objects[contentId] = `<< /Length ${String(content.length)} >>\nstream\n${content}\nendstream`;
  }
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    if (objects[id] === undefined) continue;
    offsets[id] = body.length;
    body += `${String(id)} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${String(objects.length)}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    if (offsets[id] === undefined) continue;
    body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${String(objects.length)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  fs.writeFileSync(file, body, 'latin1');
  return file;
}

for (const [kind, remote] of [
  ['manuel', '/sdcard/Download/Manuel.pdf'],
  ['td', '/sdcard/Download/TD.pdf'],
]) {
  const local = pdf(kind);
  const pushed = run(['push', local, remote]);
  if (pushed.status !== 0) throw new Error(`adb push ${kind} : ${pushed.stderr}`);
}
run([
  'shell',
  'am',
  'broadcast',
  '-a',
  'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
  '-d',
  'file:///sdcard/Download/Manuel.pdf',
]);
run([
  'shell',
  'am',
  'broadcast',
  '-a',
  'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
  '-d',
  'file:///sdcard/Download/TD.pdf',
]);

/** Prépare un compte (mot de passe + identité) avec le script éprouvé de la piste mobile. */
function ensureAuth(email, password) {
  const script = path.join(ROOT, 'apps', 'mobile', 'e2e', 'prepare-demo-user.mjs');
  const prepared = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      MOBILE_DEMO_EMAIL: email,
      MOBILE_DEMO_PASSWORD: password,
      NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    },
  });
  if (prepared.status !== 0) {
    throw new Error(
      (prepared.stderr || prepared.stdout || '').trim().split('\n').pop() ?? 'compte non préparé',
    );
  }
}

/** Identifiant d'un compte par son e-mail. */
function userIdOf(email) {
  const found = spawnSync(
    'docker',
    [
      'exec',
      'supabase_db_learny',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-tAc',
      `select id from auth.users where email = '${email}'`,
    ],
    { encoding: 'utf8' },
  );
  const id = (found.stdout ?? '').trim();
  if (id === '') throw new Error(`compte introuvable : ${email}`);
  return id;
}

/** Crée (ou remet à zéro) un compte de campagne à partir du compte de démonstration. */
async function prepareUser({ email, password, withModels }) {
  const demoEmail = env.MOBILE_DEMO_EMAIL ?? 'alex.perrin@demo.learny.test';
  ensureAuth(email, password);
  const id = userIdOf(email);
  const models = withModels
    ? `
    delete from public.ai_task_models where user_id = '${id}'::uuid;
    delete from public.ai_credentials where user_id = '${id}'::uuid;
    insert into public.ai_credentials (id, user_id, provider, label, base_url, model_ids, encrypted_key, key_last4, status, qualification, outside_eu, qualified_at, created_at, updated_at)
    select gen_random_uuid(), '${id}'::uuid, provider, label, base_url, model_ids, encrypted_key, key_last4, status, qualification, outside_eu, qualified_at, created_at, updated_at
    from public.ai_credentials where user_id = (select id from auth.users where email = '${demoEmail}');
    insert into public.ai_task_models (user_id, task, credential_id, model_id)
    select '${id}'::uuid, t.task, cnew.id, t.model_id
    from public.ai_task_models t
    join public.ai_credentials cold on cold.id = t.credential_id
    join public.ai_credentials cnew on cnew.user_id = '${id}'::uuid and cnew.provider = cold.provider and cnew.label = cold.label
    where t.user_id = (select id from auth.users where email = '${demoEmail}');
    insert into public.ai_task_models (user_id, task, credential_id, model_id)
    select '${id}'::uuid, 'simple_analysis', id, 'demo-model'
    from public.ai_credentials where user_id = '${id}'::uuid
    on conflict (user_id, task) do nothing;
    `
    : `
    delete from public.ai_task_models where user_id = '${id}'::uuid;
    delete from public.ai_credentials where user_id = '${id}'::uuid;
    `;
  const sql = `
    delete from public.formations where owner_id = '${id}'::uuid;
    insert into public.profiles (id, email, first_name, last_name, course_language, tutor_tone, timezone, onboarding_step, onboarding_completed_at, terms_version, terms_accepted_at)
    select '${id}'::uuid, '${email}', first_name, last_name, course_language, tutor_tone, timezone, onboarding_step, onboarding_completed_at, terms_version, terms_accepted_at
    from public.profiles where id = (select id from auth.users where email = '${demoEmail}')
    on conflict (id) do update set
      onboarding_step = excluded.onboarding_step,
      onboarding_completed_at = excluded.onboarding_completed_at,
      terms_version = excluded.terms_version,
      terms_accepted_at = excluded.terms_accepted_at,
      course_language = excluded.course_language,
      tutor_tone = excluded.tutor_tone,
      timezone = excluded.timezone,
      current_formation_id = null;
    insert into public.legal_acceptances (user_id, document, version, accepted_at)
    select '${id}'::uuid, document, version, accepted_at from public.legal_acceptances
    where user_id = (select id from auth.users where email = '${demoEmail}')
    on conflict do nothing;
    ${models}
  `;
  const psql = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      'supabase_db_learny',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ],
    { encoding: 'utf8' },
  );
  if (psql.status !== 0) throw new Error((psql.stderr || psql.stdout || '').trim());
}

// Le compte de démonstration est réparé d'abord : les comptes de campagne en copient le profil,
// les acceptations et les modèles.
ensureAuth(
  env.MOBILE_DEMO_EMAIL ?? 'alex.perrin@demo.learny.test',
  env.MOBILE_DEMO_PASSWORD ?? 'learny-demo-3003',
);
await prepareUser({
  email: env.MOBILE_E2E_EMAIL ?? 'parcours4003@demo.learny.test',
  password: env.MOBILE_E2E_PASSWORD ?? 'learny-demo-3003',
  withModels: true,
});
await prepareUser({
  email: env.MOBILE_NOKEY_EMAIL ?? 'nokey@demo.learny.test',
  password: env.MOBILE_NOKEY_PASSWORD ?? 'learny-demo-3003',
  withModels: false,
});
console.log(
  '✔ fixtures SPEC-4003 : Manuel.pdf et TD.pdf dans Téléchargements, comptes de campagne prêts',
);
