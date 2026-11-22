#!/usr/bin/env node
// Préflight de la campagne e2e mobile (ADR-3015 § 5, runbook § 2).
//
// Appelé en tête de `pnpm test:e2e:mobile`, avant `apps/mobile/e2e/run-maestro.mjs`. Il vérifie ce
// qui a fait échouer des campagnes pour des raisons d'outillage et **répare** ce qui peut l'être
// sans intervention :
//
//   1. disque `MOBILE_DISK_MIN_GB` (4 Go par défaut) disponible sur la racine du dépôt ;
//   2. `apps/mobile/e2e/e2e.env` : clés obligatoires, cohérence (pas de `10.0.2.2` quand un agent
//      distant est configuré, jeton présent avec l'agent) ;
//   3. APK servi : `MOBILE_APK_URL` répond 200 (le serveur statique local est relancé au besoin) ;
//   4. API publique (`EXPO_PUBLIC_API_URL/api/v1/health`) et Supabase joignables ;
//   5. agent appareil : `/health` puis `/device` avec le jeton, Maestro orphelin tué (`/cleanup`) ;
//   6. URL publique **périmée** (000/404 après un redémarrage d'instance) : republication du port
//      par l'API Agent37 puis réécriture de `e2e.env` — chaque `publish` crée une URL neuve.
//
// Usage : node tools/dev/mobile-preflight.mjs [--json] [--no-republish] [--quiet]
// Codes : 0 tout est prêt, 1 une vérification a échoué (message actionnable), 2 mauvaise usage.
//
// La republication exige une clé de l'API Agent37 (`AGENT37_API_KEY`, `AGENT37_API_KEY_FILE`, ou
// `~/.agent37/api-key`) et les identifiants d'instance (`AGENT37_INSTANCE_ID` pour la VM de
// développement, `MOBILE_DEVICE_AGENT_INSTANCE_ID` pour la VM téléphone). Sans ces valeurs, le
// préflight vérifie quand même tout et échoue en donnant la commande exacte à exécuter.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const API_ROOT = 'https://api.agent37.com/v1';
export const SANDBOX_ROOT = 'https://sandbox.agent37.app/v1';

/** Clés de `e2e.env` sans lesquelles la campagne ne peut pas démarrer. */
export const REQUIRED_KEYS = [
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'MOBILE_APK_URL',
];

/** Ports publiés qui composent une campagne (label, port par défaut, clés de `e2e.env`). */
export const PUBLISHED_PORTS = [
  {
    label: 'apk',
    port: 8099,
    key: 'MOBILE_APK_URL',
    suffix: '/app-release.apk',
    path: '',
    instance: 'dev',
  },
  {
    label: 'api',
    port: 3001,
    key: 'EXPO_PUBLIC_API_URL',
    suffix: '',
    path: '/api/v1/health',
    instance: 'dev',
  },
  {
    label: 'supabase',
    port: 54321,
    key: 'EXPO_PUBLIC_SUPABASE_URL',
    suffix: '',
    path: '/auth/v1/health',
    instance: 'dev',
  },
  {
    label: 'device-agent',
    port: 8098,
    key: 'MOBILE_DEVICE_AGENT_URL',
    suffix: '',
    path: '/health',
    instance: 'phone',
  },
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

/** Réécrit des valeurs de `e2e.env` sans toucher aux commentaires ni à l'ordre des lignes. */
export function rewriteEnvFile(content, updates) {
  const remaining = new Map(Object.entries(updates));
  const lines = String(content ?? '')
    .split('\n')
    .map((line) => {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match === null || !remaining.has(match[1])) return line;
      const key = match[1];
      const value = remaining.get(key);
      remaining.delete(key);
      return `${key}=${String(value)}`;
    });
  for (const [key, value] of remaining) lines.push(`${key}=${String(value)}`);
  return lines.join('\n');
}

/** Vérifie la présence et la cohérence des clés de `e2e.env` (aucune requête réseau). */
export function checkEnv(env) {
  const missing = REQUIRED_KEYS.filter((key) => (env[key] ?? '') === '');
  const problems = [];
  const remote = (env.MOBILE_DEVICE_AGENT_URL ?? '') !== '';
  if (remote && (env.MOBILE_DEVICE_AGENT_TOKEN ?? '') === '') {
    problems.push('MOBILE_DEVICE_AGENT_TOKEN absent alors que MOBILE_DEVICE_AGENT_URL est défini');
  }
  for (const key of ['EXPO_PUBLIC_API_URL', 'MOBILE_APK_URL', 'MOBILE_DEVICE_AGENT_URL']) {
    const value = env[key] ?? '';
    if (value === '') continue;
    if (remote && value.includes('10.0.2.2')) {
      problems.push(`${key} utilise 10.0.2.2 alors que la campagne passe par l'agent distant`);
    }
    if (!/^https?:\/\//.test(value)) problems.push(`${key} n'est pas une URL http(s) : ${value}`);
  }
  if (remote && (env.MOBILE_APK_URL ?? '').includes('10.0.2.2')) {
    problems.push("MOBILE_APK_URL doit être une URL publique : l'agent la télécharge lui-même");
  }
  return { missing, problems, ok: missing.length === 0 && problems.length === 0 };
}

/**
 * Classe une réponse HTTP d'un port public :
 *   - `ok`        : 2xx/3xx, rien à faire ;
 *   - `down`      : 502/503/504 → le service local est arrêté (redémarrer le serveur) ;
 *   - `stale`     : 404 ou connexion refusée → le port public ne route plus (republier) ;
 *   - `unauthorized` : 401/403 → jeton ou port d'un autre compte.
 */
export function classifyPortResponse(status) {
  if (status === 0) return 'stale';
  if (status === 404) return 'stale';
  if (status === 401 || status === 403) return 'unauthorized';
  // 405 : la route n'accepte que POST (agent appareil) — le port public route bien.
  if (status === 405) return 'ok';
  if (status >= 500) return 'down';
  if (status >= 200 && status < 400) return 'ok';
  return 'down';
}

/** Verdict disque : le seuil est dur (runbook § 2). */
export function diskVerdict(freeBytes, minGb) {
  const freeGb = Number(freeBytes) / 1024 ** 3;
  return { freeGb, minGb, ok: freeGb >= minGb };
}

/** Verdict de `/health` de l'agent : joignable, libre ou occupé, version du contrat. */
export function agentVerdict(health) {
  if (health === null || typeof health !== 'object') {
    return { ok: false, detail: 'agent appareil injoignable' };
  }
  if (health.ok !== true) return { ok: false, detail: 'agent appareil en erreur' };
  const busy = health.busy === true;
  return {
    ok: !busy,
    detail: busy
      ? `agent occupé par le travail ${String(health.jobId ?? '?')}`
      : `agent libre (contrat v${String(health.version ?? '?')})`,
    busy,
    jobId: health.jobId ?? null,
    version: health.version ?? null,
  };
}

/** Capacité de republication : clé et identifiants d'instance disponibles. */
export function republishCapability(env, readKey) {
  const key = env.AGENT37_API_KEY ?? readKey();
  return {
    key: key === '' ? null : key,
    devInstance: env.AGENT37_INSTANCE_ID ?? null,
    phoneInstance: env.MOBILE_DEVICE_AGENT_INSTANCE_ID ?? null,
    ok: (key ?? '') !== '',
  };
}

// ---------------------------------------------------------------------------------------------
// Entrées/sorties du CLI.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const ENV_FILE = path.join(ROOT, 'apps', 'mobile', 'e2e', 'e2e.env');
const DEFAULT_APK = path.join(
  ROOT,
  'apps',
  'mobile',
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'release',
  'app-release.apk',
);

const results = [];
function record(name, ok, detail, fix = null) {
  results.push({ name, ok, detail, ...(fix === null ? {} : { fix }) });
  return ok;
}

function readEnv() {
  if (!fs.existsSync(ENV_FILE)) return {};
  return parseEnvFile(fs.readFileSync(ENV_FILE, 'utf8'));
}

/** Clé de l'API Agent37 : env, fichier explicite, ou `~/.agent37/api-key`. */
function readApiKey() {
  const explicit =
    process.env.AGENT37_API_KEY_FILE ?? path.join(process.env.HOME ?? '', '.agent37', 'api-key');
  if (!fs.existsSync(explicit)) return '';
  return fs.readFileSync(explicit, 'utf8').trim();
}

async function probe(url, { timeoutMs = 8_000, method = 'GET', token = null } = {}) {
  try {
    const response = await fetch(url, {
      method,
      headers: token === null ? {} : { 'x-device-token': token },
      signal: globalThis.AbortSignal.timeout(timeoutMs),
    });
    return { status: response.status, body: await response.text().catch(() => '') };
  } catch {
    return { status: 0, body: '' };
  }
}

/** Relance le serveur statique de l'APK s'il ne répond pas localement (runbook § 8). */
function ensureApkServer(port, apkDir) {
  const local = spawnSync(
    'curl',
    [
      '-s',
      '-o',
      '/dev/null',
      '-w',
      '%{http_code}',
      `http://127.0.0.1:${String(port)}/app-release.apk`,
    ],
    {
      encoding: 'utf8',
      timeout: 8_000,
    },
  );
  if ((local.stdout ?? '').startsWith('2'))
    return { started: false, detail: 'serveur 8099 déjà actif' };
  if (!fs.existsSync(path.join(apkDir, 'app-release.apk'))) {
    return {
      started: false,
      detail: `APK absent : ${path.relative(ROOT, path.join(apkDir, 'app-release.apk'))}`,
    };
  }
  spawnSync(
    'nohup',
    ['python3', '-m', 'http.server', String(port), '--bind', '0.0.0.0', '--directory', apkDir],
    { encoding: 'utf8', detached: true, stdio: 'ignore' },
  );
  return { started: true, detail: `serveur statique relancé sur ${String(port)}` };
}

/** Republie un port : `unpublish` puis `publish` (chaque publication crée une URL neuve). */
async function republish({ key, instance, port, label }) {
  await fetch(`${API_ROOT}/instances/${instance}/public-ports/${String(port)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${key}` },
    signal: globalThis.AbortSignal.timeout(20_000),
  });
  const response = await fetch(`${API_ROOT}/instances/${instance}/public-ports`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ port, label }),
    signal: globalThis.AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => null);
  const url = payload?.url ?? payload?.data?.url ?? null;
  return url === null ? null : String(url);
}

/** Tente de tuer un Maestro orphelin sur l'appareil (`POST /cleanup`, agent v2). */
async function cleanupAgent(baseUrl, token) {
  const response = await probe(`${baseUrl.replace(/\/+$/, '')}/cleanup`, {
    method: 'POST',
    token,
    timeoutMs: 30_000,
  });
  return response;
}

async function main(argv) {
  const json = argv.includes('--json');
  const quiet = argv.includes('--quiet');
  const allowRepublish = !argv.includes('--no-republish');
  const log = (line) => {
    if (!quiet) console.log(line);
  };

  const env = readEnv();
  const minGb = Number(process.env.MOBILE_DISK_MIN_GB ?? env.MOBILE_DISK_MIN_GB ?? 4);
  const apkPort = Number(env.MOBILE_APK_SERVER_PORT ?? 8099);
  const apkDir = path.dirname(process.env.MOBILE_APK ?? DEFAULT_APK);

  // 1. Disque : le volume qui porte le dépôt (et non la racine du conteneur).
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
      : 'purger `apps/mobile/android/app/build/intermediates` et `.gradle`, jamais `outputs`',
  );

  // 2. e2e.env.
  const envCheck = checkEnv(env);
  record(
    'e2e.env',
    envCheck.ok,
    envCheck.ok
      ? `${REQUIRED_KEYS.length} clés obligatoires présentes`
      : [...envCheck.missing.map((key) => `${key} manquant`), ...envCheck.problems].join(' ; '),
    envCheck.ok ? null : 'corriger `apps/mobile/e2e/e2e.env` (modèle : `e2e.env.example`)',
  );

  const remote = (env.MOBILE_DEVICE_AGENT_URL ?? '') !== '';

  // 3. Serveur statique de l'APK (mode distant : l'agent télécharge).
  if (remote) {
    const server = ensureApkServer(apkPort, apkDir);
    log(`… ${server.detail}`);
  }

  // 4. URLs publiques : APK, API, Supabase, agent.
  const capability = republishCapability(env, readApiKey);
  for (const entry of PUBLISHED_PORTS) {
    if ((env[entry.key] ?? '') === '') continue;
    const base = String(env[entry.key]).replace(/\/+$/, '');
    const url = `${base}${entry.path}`;
    const probeResult = await probe(url, {
      timeoutMs: 12_000,
      token:
        entry.key === 'MOBILE_DEVICE_AGENT_URL' ? (env.MOBILE_DEVICE_AGENT_TOKEN ?? null) : null,
    });
    let kind = classifyPortResponse(probeResult.status);
    if (entry.key === 'EXPO_PUBLIC_SUPABASE_URL' && probeResult.status === 401) kind = 'ok';

    if (kind === 'ok') {
      record(entry.label, true, `${url} → ${String(probeResult.status)}`);
      continue;
    }

    if (kind === 'down' && entry.key === 'MOBILE_APK_URL') {
      const again = ensureApkServer(apkPort, apkDir);
      const retry = await probe(url, { timeoutMs: 12_000 });
      if (classifyPortResponse(retry.status) === 'ok') {
        record(entry.label, true, `${url} → ${String(retry.status)} (${again.detail})`);
        continue;
      }
    }

    if (kind === 'stale' && allowRepublish && capability.ok) {
      const instance =
        entry.instance === 'phone' ? capability.phoneInstance : capability.devInstance;
      if (instance === null) {
        record(
          entry.label,
          false,
          `${entry.key} : port périmé et identifiant d'instance absent`,
          'renseigner AGENT37_INSTANCE_ID et MOBILE_DEVICE_AGENT_INSTANCE_ID',
        );
        continue;
      }
      const renewed = await republish({
        key: capability.key,
        instance,
        port: entry.port,
        label: entry.label,
      });
      if (renewed === null) {
        record(
          entry.label,
          false,
          `republication du port ${String(entry.port)} impossible`,
          `node a37.mjs unpublish ${instance} ${String(entry.port)} puis publish`,
        );
        continue;
      }
      const value = entry.suffix === '' ? renewed : `${renewed.replace(/\/+$/, '')}${entry.suffix}`;
      fs.writeFileSync(
        ENV_FILE,
        rewriteEnvFile(fs.readFileSync(ENV_FILE, 'utf8'), { [entry.key]: value }),
      );
      const check = await probe(`${renewed.replace(/\/+$/, '')}${entry.path}`, {
        timeoutMs: 12_000,
      });
      record(
        entry.label,
        classifyPortResponse(check.status) === 'ok',
        `port ${String(entry.port)} republié → ${value} (${String(check.status)})`,
      );
      continue;
    }

    record(
      entry.label,
      false,
      `${url} → ${String(probeResult.status)} (${kind})`,
      kind === 'stale'
        ? `republier le port ${String(entry.port)} (clé Agent37 absente ou --no-republish)`
        : `redémarrer le service local du port ${String(entry.port)}`,
    );
  }

  // 5. Agent appareil : `/jobs` (l'edge intercepte `/health`), `/device`, Maestro orphelin.
  if (remote) {
    const base = String(env.MOBILE_DEVICE_AGENT_URL ?? '').replace(/\/+$/, '');
    const token = env.MOBILE_DEVICE_AGENT_TOKEN ?? null;
    const state = await probe(`${base}/jobs`, { token, timeoutMs: 8_000 });
    const stateBody = (() => {
      try {
        return JSON.parse(state.body);
      } catch {
        return null;
      }
    })();
    const verdict = agentVerdict(
      stateBody === null ? null : { ...stateBody, ok: state.status === 200 },
    );
    if (verdict.ok) {
      const cleaned = await cleanupAgent(base, token);
      record(
        'agent',
        true,
        `${verdict.detail}${cleaned.status === 404 ? ' ; /cleanup absent (agent ancien ?)' : ' ; Maestro orphelin tué'}`,
      );
    } else if (verdict.busy === true) {
      const cancel = await probe(
        `${base}/maestro/${encodeURIComponent(String(verdict.jobId))}/cancel`,
        { method: 'POST', token, timeoutMs: 20_000 },
      );
      record(
        'agent',
        cancel.status < 500,
        `agent occupé : travail ${String(verdict.jobId)} annulé (${String(cancel.status)})`,
      );
    } else {
      record(
        'agent',
        false,
        verdict.detail,
        'relancer l’agent : `sh /root/agent-deploy.sh` sur la VM téléphone',
      );
    }

    if (env.MOBILE_DEVICE_AGENT_URL !== undefined) {
      const device = await probe(`${base}/device`, { method: 'POST', token, timeoutMs: 120_000 });
      const deviceBody = (() => {
        try {
          return JSON.parse(device.body);
        } catch {
          return null;
        }
      })();
      record(
        'appareil',
        deviceBody?.ok === true,
        deviceBody?.device?.serial === undefined
          ? 'aucun appareil adb'
          : `${String(deviceBody.device.serial)} (API ${String(deviceBody.device.apiLevel ?? '?')})`,
        deviceBody?.ok === true ? null : 'démarrer l’émulateur (AVD agent37) sur la VM téléphone',
      );
    }
  } else {
    const adb = spawnSync(process.env.ADB ?? 'adb', ['devices'], { encoding: 'utf8' });
    const connected = (adb.stdout ?? '').split('\n').some((line) => line.trim().endsWith('device'));
    record(
      'appareil',
      connected,
      connected ? 'appareil adb local prêt' : 'aucun appareil adb local',
      connected ? null : 'démarrer l’émulateur local',
    );
  }

  // 6. Rapport.
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
    if (!json)
      console.error(
        `\n✖ préflight : ${String(failures.length)} vérification(s) en échec (ADR-3015 § 5).`,
      );
    return 1;
  }
  if (!json) log('\n✔ préflight : campagne prête (ADR-3015 § 5).');
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
