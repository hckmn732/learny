#!/usr/bin/env node
// Préflight de la campagne e2e mobile sur l'émulateur local (ADR-3018, runbook § 3).
//
// Appelé en tête de `pnpm test:e2e:mobile`, avant `apps/mobile/e2e/run-maestro.mjs`. Il vérifie ce
// qui doit l'être avant une campagne, et démarre l'émulateur local s'il est absent :
//
//   1. disque `MOBILE_DISK_MIN_GB` (4 Go par défaut) disponible sur la racine du dépôt ;
//   2. `apps/mobile/e2e/e2e.env` : clés obligatoires présentes, aucune clé du mode distant
//      (`MOBILE_DEVICE_AGENT_*`, `MOBILE_APK_URL`, identifiants Agent37) ;
//   3. appareil : `adb devices` doit lister un appareil connecté (sinon
//      `tools/dev/emulator-up.sh` est lancé, puis vérifié) ;
//   4. démarrage terminé : `sys.boot_completed` = 1 ;
//   5. API : `<EXPO_PUBLIC_API_URL>/api/v1/health` → 200 ;
//   6. Supabase : `<EXPO_PUBLIC_SUPABASE_URL>/auth/v1/health` → 200 (401 accepté si la passerelle
//      exige la clé anonyme).
//
// `10.0.2.2` n'existe que dans l'émulateur : c'est l'hôte de l'émulateur, donc cette VM. Les sondes
// réseau le réécrivent en `127.0.0.1`, sans quoi le préflight échouerait depuis l'hôte.
//
// Usage : node tools/dev/mobile-preflight.mjs [--json] [--quiet]
// Codes : 0 tout est prêt, 1 une vérification a échoué (message actionnable), 2 mauvaise usage.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Clés de `e2e.env` sans lesquelles la campagne (ou le build e2e) ne peut pas démarrer. */
export const REQUIRED_KEYS = [
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_WEB_URL',
];

/** Clés du mode dual-VM retiré (ADR-3012) : leur présence trahit un `e2e.env` périmé. */
export const DEPRECATED_KEYS = [
  'MOBILE_DEVICE_AGENT_URL',
  'MOBILE_DEVICE_AGENT_TOKEN',
  'MOBILE_APK_URL',
  'MOBILE_DEVICE_AGENT_INSTANCE_ID',
  'AGENT37_INSTANCE_ID',
];

/** Lit un fichier `KEY=value` (commentaires et lignes vides ignorés). */
export function parseEnvFile(content) {
  const values = {};
  for (const line of String(content ?? '').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) values[match[1]] = match[2];
  }
  return values;
}

/** Vérifie la présence et la cohérence des clés de `e2e.env` (aucune requête réseau). */
export function checkEnv(env) {
  const missing = REQUIRED_KEYS.filter((key) => (env[key] ?? '') === '');
  const problems = [];

  for (const key of DEPRECATED_KEYS) {
    if ((env[key] ?? '') !== '') {
      problems.push(`${key} n'est plus utilisé (ADR-3018) : supprimer la clé`);
    }
  }
  for (const key of ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_WEB_URL']) {
    const value = env[key] ?? '';
    if (value !== '' && !/^https?:\/\//.test(value)) {
      problems.push(`${key} n'est pas une URL http(s) : ${value}`);
    }
    if (/^https?:\/\/(127\.0\.0\.1|localhost)([:/]|$)/.test(value)) {
      problems.push(
        `${key} désigne la boucle locale de l'hôte : l'émulateur la joint par 10.0.2.2 (ADR-3018)`,
      );
    }
  }

  return { missing, problems, ok: missing.length === 0 && problems.length === 0 };
}

/**
 * URL à sonder depuis l'hôte : `10.0.2.2`, l'hôte de l'émulateur, est cette VM. Rend `null` pour
 * une valeur qui n'est pas une URL absolue.
 */
export function hostProbeUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.hostname === '10.0.2.2') url.hostname = '127.0.0.1';
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Classe une réponse HTTP : `ok` (2xx/3xx), `unauthorized` (401/403), `down` (0 ou 4xx/5xx).
 * Le préflight accepte `unauthorized` pour Supabase, dont la route de santé peut exiger la clé.
 */
export function classifyHttp(status) {
  if (status >= 200 && status < 400) return 'ok';
  if (status === 401 || status === 403) return 'unauthorized';
  return 'down';
}

/** Verdict disque : le seuil est dur (runbook § 8). */
export function diskVerdict(freeBytes, minGb) {
  const freeGb = Number(freeBytes) / 1024 ** 3;
  return { freeGb, minGb, ok: freeGb >= minGb };
}

/** Verdict de `adb devices` : un appareil connecté, un appareil hors ligne, ou aucun. */
export function adbVerdict(output) {
  const devices = String(output ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('List of devices'))
    .map((line) => {
      const [serial, state] = line.split(/\s+/);
      return { serial: serial ?? '', state: state ?? '' };
    })
    .filter((device) => device.serial !== '');
  const ready = devices.find((device) => device.state === 'device') ?? null;
  const offline = devices.find((device) => device.state !== 'device') ?? null;
  return {
    ok: ready !== null,
    serial: ready?.serial ?? null,
    offline: offline?.serial ?? null,
    detail:
      ready !== null
        ? `${ready.serial} connecté`
        : offline !== null
          ? `${offline.serial} ${offline.state}`
          : 'aucun appareil adb',
  };
}

/** Verdict de `getprop sys.boot_completed` : `1` seulement quand le démarrage est terminé. */
export function bootVerdict(output) {
  const value = String(output ?? '').trim();
  return { booted: value === '1', value };
}

// ---------------------------------------------------------------------------------------------
// Entrées/sorties du CLI.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const ENV_FILE = path.join(ROOT, 'apps', 'mobile', 'e2e', 'e2e.env');

const results = [];
function record(name, ok, detail, fix = null) {
  results.push({ name, ok, detail, ...(fix === null ? {} : { fix }) });
  return ok;
}

function sdkRoot() {
  return process.env.ANDROID_SDK_ROOT ?? process.env.ANDROID_HOME ?? '/opt/android-sdk';
}

function adbBinary() {
  if (process.env.ADB !== undefined) return process.env.ADB;
  const candidate = path.join(sdkRoot(), 'platform-tools', 'adb');
  return fs.existsSync(candidate) ? candidate : 'adb';
}

function adb(args, timeout = 30_000) {
  const result = spawnSync(adbBinary(), args, { encoding: 'utf8', timeout });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function readEnv() {
  if (!fs.existsSync(ENV_FILE)) return {};
  return parseEnvFile(fs.readFileSync(ENV_FILE, 'utf8'));
}

async function probe(url, { timeoutMs = 8_000 } = {}) {
  try {
    const response = await fetch(url, { signal: globalThis.AbortSignal.timeout(timeoutMs) });
    return { status: response.status, body: await response.text().catch(() => '') };
  } catch {
    return { status: 0, body: '' };
  }
}

/** Démarre l'émulateur local (idempotent) quand aucun appareil n'est connecté. */
function startEmulator(quiet) {
  const script = path.join(ROOT, 'tools', 'dev', 'emulator-up.sh');
  if (!fs.existsSync(script)) return { ok: false, detail: `script absent : ${script}` };
  const timeoutMs = Number(process.env.MOBILE_BOOT_TIMEOUT_S ?? 600) * 1_000 + 60_000;
  const result = spawnSync('bash', [script], {
    encoding: 'utf8',
    timeout: timeoutMs,
    stdio: quiet ? 'ignore' : 'inherit',
  });
  return {
    ok: result.status === 0,
    detail:
      result.status === 0
        ? `émulateur démarré (${path.relative(ROOT, script)})`
        : `échec de ${path.relative(ROOT, script)} (code ${String(result.status ?? 1)})`,
  };
}

async function main(argv) {
  const json = argv.includes('--json');
  const quiet = argv.includes('--quiet');
  const log = (line) => {
    if (!quiet) console.log(line);
  };

  const env = readEnv();
  const minGb = Number(process.env.MOBILE_DISK_MIN_GB ?? env.MOBILE_DISK_MIN_GB ?? 4);

  // 1. Disque : le volume qui porte le dépôt.
  let freeBytes = 0;
  for (const target of [ROOT, '/root', '/']) {
    try {
      const stat = fs.statfsSync(target);
      freeBytes = stat.bavail * stat.bsize;
      break;
    } catch {
      freeBytes = 0;
    }
  }
  const disk = diskVerdict(freeBytes, minGb);
  record(
    'disque',
    disk.ok,
    `${disk.freeGb.toFixed(1)} Go libres (seuil ${String(minGb)} Go)`,
    disk.ok
      ? null
      : 'purger `app/build/intermediates` et `.gradle`, garder `outputs` (runbook § 8)',
  );

  // 2. e2e.env.
  const envCheck = checkEnv(env);
  record(
    'e2e.env',
    envCheck.ok,
    envCheck.ok
      ? `${String(REQUIRED_KEYS.length)} clés obligatoires présentes, aucune clé du mode distant`
      : [...envCheck.missing.map((key) => `${key} manquant`), ...envCheck.problems].join(' ; '),
    envCheck.ok ? null : 'corriger `apps/mobile/e2e/e2e.env` (modèle : `e2e.env.example`)',
  );

  // 3. Appareil : adb, puis démarrage de l'émulateur local au besoin.
  let device = adbVerdict(adb(['devices']).stdout);
  if (!device.ok) {
    log(`… ${device.detail} : démarrage de l'émulateur local`);
    const started = startEmulator(quiet);
    if (!started.ok) {
      record('appareil', false, started.detail, 'lire /root/logs/emulator.log (runbook § 9)');
      device = { ok: false, serial: null, detail: started.detail };
    } else {
      device = adbVerdict(adb(['devices']).stdout);
      record(
        'appareil',
        device.ok,
        `${device.detail} (${started.detail})`,
        device.ok ? null : 'émulateur démarré mais absent de `adb devices` (runbook § 9)',
      );
    }
  } else {
    record('appareil', true, device.detail);
  }

  // 4. Démarrage terminé.
  if (device.ok && device.serial !== null) {
    const boot = bootVerdict(
      adb(['-s', device.serial, 'shell', 'getprop', 'sys.boot_completed']).stdout,
    );
    record(
      'démarrage',
      boot.booted,
      boot.booted
        ? `sys.boot_completed=1 (${device.serial})`
        : `sys.boot_completed=${boot.value || 'vide'} (${device.serial})`,
      boot.booted
        ? null
        : 'attendre la fin du démarrage, sinon `emulator-down.sh && emulator-up.sh`',
    );
  } else {
    record(
      'démarrage',
      false,
      'aucun appareil pour lire sys.boot_completed',
      'démarrer l’émulateur local',
    );
  }

  // 5 et 6. API et Supabase, sondés depuis l'hôte (10.0.2.2 → 127.0.0.1).
  const services = [
    {
      name: 'API',
      key: 'EXPO_PUBLIC_API_URL',
      path: '/api/v1/health',
      acceptUnauthorized: false,
      fix: 'démarrer l’API : `pnpm --filter @learny/api dev` (runbook § 4)',
    },
    {
      name: 'Supabase',
      key: 'EXPO_PUBLIC_SUPABASE_URL',
      path: '/auth/v1/health',
      acceptUnauthorized: true,
      fix: 'démarrer la pile : `pnpm dev:up`',
    },
  ];
  for (const service of services) {
    const value = env[service.key] ?? '';
    if (value === '') {
      record(service.name, false, `${service.key} absent de e2e.env`, service.fix);
      continue;
    }
    const base = hostProbeUrl(value);
    if (base === null) {
      record(
        service.name,
        false,
        `${service.key} n'est pas une URL absolue : ${value}`,
        service.fix,
      );
      continue;
    }
    const url = `${base.replace(/\/+$/, '')}${service.path}`;
    const response = await probe(url);
    const kind = classifyHttp(response.status);
    const ok = kind === 'ok' || (kind === 'unauthorized' && service.acceptUnauthorized);
    const where =
      url === `${value.replace(/\/+$/, '')}${service.path}` ? url : `${url} (via ${value})`;
    record(
      service.name,
      ok,
      `${where} → ${response.status === 0 ? 'injoignable' : String(response.status)}`,
      ok ? null : service.fix,
    );
  }

  // 7. Rapport.
  const failures = results.filter((entry) => !entry.ok);
  if (json) {
    console.log(JSON.stringify({ ok: failures.length === 0, results }, null, 2));
  } else if (!quiet) {
    for (const entry of results) {
      log(`${entry.ok ? '✔' : '✖'} ${entry.name} : ${entry.detail}`);
      if (!entry.ok && entry.fix !== null) log(`  → ${entry.fix}`);
    }
  }
  if (failures.length > 0) {
    if (!json) {
      console.error(
        `\n✖ préflight : ${String(failures.length)} vérification(s) en échec (ADR-3018).`,
      );
    }
    return 1;
  }
  if (!json) log('\n✔ préflight : campagne prête sur l’émulateur local (ADR-3018).');
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`✖ préflight : ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
