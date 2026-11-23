#!/usr/bin/env node
// Local `e2e` build of the mobile application (SPEC-3001 EF-3, `pnpm build:mobile:e2e`).
//
// The build is reproducible from a clean checkout:
//   1. `expo prebuild -p android` generates the native project (new architecture, Hermes);
//   2. `./gradlew assembleRelease` produces android/app/build/outputs/apk/release/app-release.apk.
// The public configuration comes from the environment or from `e2e/e2e.env` (never committed).
// Disk hygiene is checked before Gradle runs: below 4 GB free the build would fail mid-way.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, '..');
const ROOT = path.resolve(APP_DIR, '..', '..');
const ANDROID_DIR = path.join(APP_DIR, 'android');
const APK = path.join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const MIN_FREE_BYTES = 4 * 1024 ** 3;

function readEnvFile() {
  const file = path.join(APP_DIR, 'e2e', 'e2e.env');
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) out[match[1]] = match[2];
  }
  return out;
}

const env = {
  ...readEnvFile(),
  ...process.env,
  // A test build always enables the SDD pages and freezes the clock (ADR-3004 § 7).
  EXPO_PUBLIC_ENABLE_SDD_PAGES: '1',
  EXPO_PUBLIC_CLOCK_FIXED_AT: process.env.EXPO_PUBLIC_CLOCK_FIXED_AT ?? '2026-11-11T12:20:00Z',
  // ADR-3018 — le build e2e joint l'API locale de l'émulateur en HTTP (`10.0.2.2`) : le plugin de
  // configuration n'autorise le trafic en clair que lorsque cette variable est posée.
  LEARNY_E2E_CLEARTEXT: '1',
  // ADR-3018 : un build e2e ne sert qu'à l'émulateur local (x86_64). Les 4 ABI
  // multipliaient la compilation native par quatre (~20 min par spec).
  ORG_GRADLE_PROJECT_reactNativeArchitectures:
    process.env.ORG_GRADLE_PROJECT_reactNativeArchitectures ?? 'x86_64',
  ANDROID_HOME: process.env.ANDROID_HOME ?? '/opt/android-sdk',
  ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT ?? '/opt/android-sdk',
  CI: '1',
};

const REQUIRED = [
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_WEB_URL',
];
const missing = REQUIRED.filter((key) => env[key] === undefined || env[key] === '');
if (missing.length > 0) {
  console.error(`✖ configuration manquante : ${missing.join(', ')} (voir e2e/e2e.env.example).`);
  process.exit(2);
}

const stats = fs.statfsSync(ROOT);
const freeBytes = stats.bavail * stats.bsize;
if (freeBytes < MIN_FREE_BYTES) {
  console.error(
    `✖ espace disque insuffisant : ${(freeBytes / 1024 ** 3).toFixed(1)} Go libres, 4 Go requis ` +
      `(voir la section « hygiène disque » du BRIEF).`,
  );
  process.exit(2);
}

function run(command, args, cwd) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env });
  return result.status ?? 1;
}

// `expo prebuild` est idempotent et rejoue les plugins de `app.config.ts` (dont celui du HTTP
// local, ADR-3018). Il n'est relancé que si le projet natif manque ou si le manifeste ne porte pas
// encore l'autorisation e2e : le rejouer à chaque build coûterait une recompilation native
// complète (~15 min) pour rien. Aucune retouche manuelle de `android/` n'est jamais nécessaire.
const MANIFEST = path.join(ANDROID_DIR, 'app', 'src', 'main', 'AndroidManifest.xml');
const cleartextReady =
  fs.existsSync(MANIFEST) &&
  fs.readFileSync(MANIFEST, 'utf8').includes('android:usesCleartextTraffic="true"');
if (!fs.existsSync(path.join(ANDROID_DIR, 'gradlew')) || !cleartextReady) {
  console.log('• expo prebuild (configuration native à jour)');
  const prebuild = run('npx', ['expo', 'prebuild', '-p', 'android', '--no-install'], APP_DIR);
  if (prebuild !== 0) process.exit(prebuild);
}

const gradle = run('./gradlew', ['assembleRelease', '--no-daemon'], ANDROID_DIR);
if (gradle !== 0) process.exit(gradle);

if (!fs.existsSync(APK)) {
  console.error(`✖ APK introuvable : ${path.relative(ROOT, APK)}`);
  process.exit(1);
}
console.log(
  `\n✔ APK e2e : ${path.relative(ROOT, APK)} (${(fs.statSync(APK).size / 1024 ** 2).toFixed(1)} Mo)`,
);
