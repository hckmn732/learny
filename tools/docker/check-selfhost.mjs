#!/usr/bin/env node
/* global AbortSignal */
// Contrôle de la pile auto-hébergée (SPEC-012, ET-6, CL-1, CL-4, CL-5, CL-7).
//
// `node tools/docker/check-selfhost.mjs` valide statiquement le Compose, les Dockerfiles, le guide
// et, si Docker est disponible, la configuration résolue (`docker compose config`).
// `--up` construit les images et démarre réellement la pile dans un projet Compose isolé, puis
// vérifie la santé et les volumes. Aucune valeur d'environnement n'est imprimée.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import YAML from 'yaml';

import { toolNow } from './selfhost-secrets.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const COMPOSE_FILE = 'docker/compose.selfhost.yml';
export const GUIDE_FILE = 'docs/operations/self-hosting.md';
export const DOCKERIGNORE_FILE = '.dockerignore';
export const STATUS_FILE = path.join(ROOT, '.sdd', 'tmp', 'selfhost-check.json');

export const REQUIRED_SERVICES = [
  'db',
  'migrate',
  'auth',
  'rest',
  'storage',
  'inngest',
  'kong',
  'web',
  'worker',
];
export const HEALTHCHECKED_SERVICES = ['db', 'auth', 'storage', 'inngest', 'kong', 'web', 'worker'];
export const EXPECTED_VOLUMES = {
  'db-data': '/var/lib/postgresql/data',
  'storage-data': '/var/lib/storage',
  'inngest-data': '/var/lib/inngest',
};
/** Public host ports; every other service stays on the internal network (ET-3). */
export const PUBLISHED_SERVICES = ['web', 'kong', 'inngest'];
export const SECRET_BUILD_ARG_NAMES = [
  'POSTGRES_PASSWORD',
  'SUPABASE_JWT_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
  'APP_ENCRYPTION_KEY',
  'RATE_LIMIT_IP_SECRET',
  'EMAIL_LINK_SECRET',
  'INNGEST_SIGNING_KEY',
  'INNGEST_EVENT_KEY',
  'ANTHROPIC_API_KEY',
  'RESEND_API_KEY',
];

const REQUIRED_VARIABLE_PATTERN = /\$\{([A-Z0-9_]+):\?/g;

export function readFile(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

export function parseComposeYaml(text) {
  const doc = YAML.parse(text);
  if (doc === null || typeof doc !== 'object') throw new Error('compose : document YAML invalide');
  return doc;
}

/** Every `${VAR:?message}` of the file must be declared; duplicates are collapsed. */
export function requiredVariables(text) {
  return [
    ...new Set([...text.matchAll(REQUIRED_VARIABLE_PATTERN)].map((match) => match[1])),
  ].sort();
}

export function parseEnvFile(text) {
  const vars = {};
  for (const line of text.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=(.*)$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    vars[key] = (raw ?? '')
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .replace(/^'(.*)'$/, '$1');
  }
  return vars;
}

export function missingRequiredVariables(text, env) {
  return requiredVariables(text).filter((name) => env[name] === undefined || env[name] === '');
}

function isPinnedImage(image) {
  if (typeof image !== 'string' || image === '') return false;
  // Raw documents use `${LEARNY_WEB_IMAGE:-learny-web:dev}`: validate the documented default.
  const candidate = image.includes('${')
    ? (/\$\{[^:}]+:-?([^}]*)\}/.exec(image)?.[1] ?? '')
    : image;
  if (/@sha256:[a-f0-9]{64}$/.test(candidate)) return true;
  if (/:latest$/.test(candidate)) return false;
  return /:[A-Za-z0-9][A-Za-z0-9._-]*$/.test(candidate);
}

function hasHealthcheck(service) {
  return (
    service !== null &&
    typeof service === 'object' &&
    service.healthcheck !== undefined &&
    service.healthcheck !== null &&
    service.healthcheck.disable !== true
  );
}

/** Static checks of the Compose document as written (variables are still `${VAR:?}`). */
export function validateComposeDocument(doc, text) {
  const errors = [];
  const services = doc.services ?? {};
  const names = Object.keys(services);
  for (const name of REQUIRED_SERVICES) {
    if (!names.includes(name)) errors.push(`service manquant : ${name}`);
  }
  for (const name of PUBLISHED_SERVICES) {
    const ports = services[name]?.ports ?? [];
    if (ports.length === 0) errors.push(`service ${name} : aucun port publié (attendu)`);
  }
  for (const name of names) {
    if (PUBLISHED_SERVICES.includes(name) || name === 'mailpit') continue;
    if ((services[name]?.ports ?? []).length > 0) {
      errors.push(`service ${name} : port publié interdit (réseau interne uniquement)`);
    }
  }
  for (const name of HEALTHCHECKED_SERVICES) {
    if (!hasHealthcheck(services[name])) errors.push(`service ${name} : contrôle de santé absent`);
  }
  if (!hasHealthcheck(services.mailpit)) errors.push('service mailpit : contrôle de santé absent');
  if ((services.mailpit?.profiles ?? []).length === 0) {
    errors.push('service mailpit : doit rester optionnel via un profil');
  }
  for (const name of ['web', 'worker']) {
    const service = services[name];
    const user = String(service?.user ?? '');
    if (!/^(?:[1-9][0-9]*|[a-z][a-z0-9_-]*)(?::[0-9]+)?$/.test(user) || /^root(:|$)/.test(user)) {
      errors.push(`service ${name} : utilisateur non root explicite requis`);
    }
    if (service?.build?.dockerfile === undefined)
      errors.push(`service ${name} : build.dockerfile absent`);
  }
  for (const name of names) {
    const service = services[name];
    if (service?.privileged === true) errors.push(`service ${name} : privileged interdit`);
    if (service?.network_mode === 'host')
      errors.push(`service ${name} : network_mode host interdit`);
    if (service?.image !== undefined && !isPinnedImage(service.image)) {
      errors.push(`service ${name} : image non épinglée (${String(service.image)})`);
    }
  }
  const webDeps = services.web?.depends_on ?? {};
  for (const dep of ['db', 'auth', 'storage', 'inngest', 'migrate']) {
    if (webDeps[dep] === undefined) errors.push(`web : dépendance ${dep} absente`);
  }
  if (webDeps.migrate?.condition !== 'service_completed_successfully') {
    errors.push('web : les migrations doivent se terminer avant le démarrage');
  }
  const volumes = doc.volumes ?? {};
  for (const volume of Object.keys(EXPECTED_VOLUMES)) {
    if (volumes[volume] === undefined) errors.push(`volume nommé manquant : ${volume}`);
  }
  const rawMounts = Object.values(services)
    .flatMap((service) => service?.volumes ?? [])
    .filter((mount) => typeof mount === 'string');
  for (const [volume, target] of Object.entries(EXPECTED_VOLUMES)) {
    if (!rawMounts.some((mount) => mount.startsWith(`${volume}:${target}`))) {
      errors.push(`volume ${volume} non monté sur ${target}`);
    }
  }
  for (const name of ['db', 'auth', 'storage', 'inngest']) {
    if (services[name]?.restart === 'no') errors.push(`service ${name} : restart no interdit`);
  }
  for (const name of requiredVariables(text)) {
    if (!text.includes(`\${${name}:?`)) errors.push(`variable ${name} : syntaxe :? absente`);
  }
  if (!text.includes('INNGEST_SIGNING_KEY:?'))
    errors.push('INNGEST_SIGNING_KEY doit être obligatoire');
  return errors;
}

/** Checks the resolved configuration (`docker compose config --format json`). */
export function validateResolvedConfig(config) {
  const errors = [];
  const services = config.services ?? {};
  for (const name of REQUIRED_SERVICES) {
    if (services[name] === undefined) errors.push(`config résolue : service ${name} absent`);
  }
  for (const name of PUBLISHED_SERVICES) {
    const ports = services[name]?.ports ?? [];
    if (ports.length === 0) errors.push(`config résolue : ${name} sans port publié`);
  }
  for (const name of HEALTHCHECKED_SERVICES) {
    if ((services[name]?.healthcheck?.test ?? []).length === 0) {
      errors.push(`config résolue : ${name} sans contrôle de santé`);
    }
  }
  for (const name of ['web', 'worker']) {
    const user = String(services[name]?.user ?? '');
    if (user === '' || /^0(:|$)/.test(user) || /^root(:|$)/.test(user)) {
      errors.push(`config résolue : ${name} ne doit pas tourner en root`);
    }
    const args = services[name]?.build?.args ?? {};
    for (const key of Object.keys(args)) {
      if (SECRET_BUILD_ARG_NAMES.includes(key)) {
        errors.push(`config résolue : ${name} reçoit le secret ${key} au build`);
      }
    }
  }
  const webEnv = services.web?.environment ?? {};
  if (webEnv.DATABASE_URL === undefined) errors.push('config résolue : web sans DATABASE_URL');
  if (webEnv.ENABLE_SDD_PAGES !== 'false' && webEnv.ENABLE_SDD_PAGES !== '0') {
    errors.push('config résolue : les pages SDD doivent être désactivées');
  }
  for (const name of ['db', 'auth', 'rest', 'storage']) {
    if ((services[name]?.ports ?? []).length > 0) {
      errors.push(`config résolue : ${name} exposé sur l'hôte`);
    }
  }
  const volumes = config.volumes ?? {};
  for (const volume of Object.keys(EXPECTED_VOLUMES)) {
    if (typeof volumes[volume]?.name !== 'string')
      errors.push(`config résolue : volume ${volume} absent`);
  }
  return errors;
}

/** Static checks of a Dockerfile: no secret context, no root, frozen lockfile, multi-stage. */
export function validateDockerfile(text) {
  const errors = [];
  const fromLines = text.split('\n').filter((line) => /^FROM\s/i.test(line));
  if (fromLines.length < 3)
    errors.push('Dockerfile : construction multi-étapes attendue (>= 3 FROM)');
  if (!text.includes('pnpm install --frozen-lockfile')) {
    errors.push('Dockerfile : installation avec --frozen-lockfile requise');
  }
  if (/\b(?:COPY|ADD)\b[^\n]*\.env/i.test(text)) {
    errors.push('Dockerfile : copie d’un fichier .env interdite');
  }
  for (const line of text.split('\n')) {
    const arg = /^ARG\s+([A-Z0-9_]+)/i.exec(line);
    if (arg === null) continue;
    const name = arg[1];
    if (name.startsWith('NEXT_PUBLIC_')) continue;
    if (/(?:PASSWORD|SECRET|TOKEN|_KEY)$/.test(name)) {
      errors.push(`Dockerfile : argument de build ressemblant à un secret (${name})`);
    }
  }
  if (/^USER\s+root\b/im.test(text)) errors.push('Dockerfile : USER root interdit');
  const lastFrom = text
    .split('\n')
    .reduce((index, line, current) => (/^FROM\s/i.test(line) ? current : index), -1);
  const runtime = text
    .split('\n')
    .slice(lastFrom + 1)
    .join('\n');
  if (!/^USER\s+(?:node|[1-9][0-9]*)(?::[0-9]+)?\s*$/im.test(runtime)) {
    errors.push('Dockerfile : étape finale sans USER non root');
  }
  if (!/NODE_ENV=production/.test(runtime)) errors.push('Dockerfile : NODE_ENV=production absent');
  if (!/COPY --from=builder/.test(runtime)) errors.push('Dockerfile : sortie de build non copiée');
  if (!/org\.opencontainers\.image\.revision/.test(text)) {
    errors.push('Dockerfile : étiquette du commit (org.opencontainers.image.revision) absente');
  }
  return errors;
}

export function validateDockerignore(text) {
  const errors = [];
  const lines = text.split('\n').map((line) => line.trim());
  for (const pattern of ['.env', '.env.*', '**/node_modules', '.git']) {
    if (!lines.includes(pattern)) errors.push(`.dockerignore : motif ${pattern} absent`);
  }
  if (lines.includes('!.env.example'))
    errors.push('.dockerignore : .env.example ne doit pas être réintroduit');
  return errors;
}

export function validateGuide(text) {
  const errors = [];
  const sections = [
    [/pr[ée]requis/i, 'prérequis'],
    [/secret/i, 'secrets'],
    [/d[ée]marr/i, 'démarrage'],
    [/migration/i, 'migrations'],
    [/sant[ée]/i, 'santé'],
    [/sauvegarde/i, 'sauvegarde'],
    [/mettre [àa] jour|mise [àa] jour/i, 'mise à jour'],
    [/arr[êe]t/i, 'arrêt'],
  ];
  for (const [pattern, label] of sections) {
    if (!pattern.test(text)) errors.push(`guide : section « ${label} » absente`);
  }
  for (const token of [
    'docker/compose.selfhost.yml',
    '.env.selfhost',
    'tools/docker/check-selfhost.mjs',
  ]) {
    if (!text.includes(token)) errors.push(`guide : référence ${token} absente`);
  }
  if (!/down(?!\s+-v)/.test(text))
    errors.push('guide : commande d’arrêt sans suppression de volume absente');
  if (text.includes('down -v'))
    errors.push('guide : « down -v » interdit (supprimerait les volumes)');
  if (/sk-[A-Za-z0-9]{10,}/.test(text)) errors.push('guide : valeur ressemblant à une clé API');
  if (/eyJ[A-Za-z0-9_-]{20,}\./.test(text)) errors.push('guide : jeton JWT en clair');
  return errors;
}

export function redact(text, env) {
  let out = String(text);
  for (const value of Object.values(env)) {
    if (typeof value === 'string' && value.length >= 8) out = out.split(value).join('***');
  }
  return out;
}

export function dockerAvailable() {
  return spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;
}

export function composeCommand(project, envFile, args) {
  return [
    'compose',
    '--project-name',
    project,
    '--env-file',
    envFile,
    '-f',
    path.join(ROOT, COMPOSE_FILE),
    ...args,
  ];
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', ...options });
}

export function loadEnvFile(file) {
  const full = path.isAbsolute(file) ? file : path.join(ROOT, file);
  if (!fs.existsSync(full)) throw new Error(`fichier d'environnement absent : ${file}`);
  return { path: full, vars: parseEnvFile(fs.readFileSync(full, 'utf8')) };
}

export function composeConfig(envFile, env = {}) {
  const result = run(
    'docker',
    composeCommand('learny-selfhost-check', envFile, ['config', '--format', 'json']),
    {
      env: { ...env },
    },
  );
  if (result.status !== 0) {
    return { ok: false, error: redact(`${result.stderr ?? ''}${result.stdout ?? ''}`.trim(), env) };
  }
  try {
    return { ok: true, config: JSON.parse(result.stdout) };
  } catch (error) {
    return {
      ok: false,
      error: `sortie JSON invalide : ${error instanceof Error ? error.message : '?'}`,
    };
  }
}

export function composeUp(project, envFile, env, { build = true } = {}) {
  const args = ['up', '-d', ...(build ? ['--build'] : [])];
  const result = run('docker', composeCommand(project, envFile, args), { env, stdio: 'inherit' });
  return result.status === 0;
}

export function composeDown(project, envFile, env) {
  const result = run('docker', composeCommand(project, envFile, ['down', '--remove-orphans']), {
    env,
    stdio: 'inherit',
  });
  return result.status === 0;
}

export function composePs(project, envFile, env) {
  const result = run(
    'docker',
    composeCommand(project, envFile, ['ps', '--all', '--format', 'json']),
    { env },
  );
  if (result.status !== 0)
    return { ok: false, services: [], error: redact(result.stderr ?? '', env) };
  const raw = (result.stdout ?? '').trim();
  if (raw === '') return { ok: true, services: [] };
  let services;
  try {
    services = JSON.parse(raw);
  } catch {
    services = raw
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
  return { ok: true, services: Array.isArray(services) ? services : [services] };
}

/** Stack is ready when every long-running service is healthy and the migration job succeeded. */
export function stackReady(services) {
  const byName = new Map(services.map((service) => [service.Service ?? service.Name, service]));
  for (const name of REQUIRED_SERVICES) {
    const service = byName.get(name);
    if (service === undefined) return false;
    const state = (service.State ?? '').toLowerCase();
    const health = (service.Health ?? '').toLowerCase();
    if (name === 'migrate') {
      if (state !== 'exited' || (service.ExitCode ?? 0) !== 0) return false;
      continue;
    }
    if (state !== 'running') return false;
    const expectedHealth = HEALTHCHECKED_SERVICES.includes(name);
    if (expectedHealth && health !== 'healthy') return false;
  }
  return true;
}

async function waitFor(predicate, timeoutMs, intervalMs = 2000) {
  const attempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

export async function waitForStack(project, envFile, env, timeoutMs = 300000) {
  let last = [];
  const ok = await waitFor(() => {
    const ps = composePs(project, envFile, env);
    last = ps.services;
    return ps.ok && stackReady(last);
  }, timeoutMs);
  return { ok, services: last };
}

export function imageLabels(image) {
  if (image === undefined || image === '') return null;
  const result = run('docker', [
    'image',
    'inspect',
    image,
    '--format',
    '{{json .Config.Labels}}|{{json .Config.User}}|{{.Id}}',
  ]);
  if (result.status !== 0) return null;
  const [labels, user, id] = (result.stdout ?? '').trim().split('|');
  return { labels: JSON.parse(labels ?? '{}'), user: user ? JSON.parse(user) : '', id: id ?? '' };
}

/** Labels and user of the image actually used by a running service (survives retagging). */
export function serviceImageInfo(project, envFile, env, service) {
  const id = run('docker', composeCommand(project, envFile, ['ps', '-q', service]), { env });
  const container = (id.stdout ?? '').trim();
  if (id.status !== 0 || container === '') return null;
  const result = run('docker', [
    'inspect',
    container,
    '--format',
    '{{json .Config.Labels}}|{{json .Config.User}}|{{.Config.Image}}',
  ]);
  if (result.status !== 0) return null;
  const [labels, user, image] = (result.stdout ?? '').trim().split('|');
  return {
    labels: JSON.parse(labels ?? '{}'),
    user: user ? JSON.parse(user) : '',
    image: image ?? '',
  };
}

export function projectVolumes(project) {
  const result = run('docker', [
    'volume',
    'ls',
    '--filter',
    `label=com.docker.compose.project=${project}`,
    '--format',
    '{{.Name}}',
  ]);
  if (result.status !== 0) return [];
  return (result.stdout ?? '').split('\n').filter(Boolean).sort();
}

export function buildImage(tag, dockerfile, buildArgs, env = {}) {
  const args = ['build', '-f', dockerfile, '-t', tag];
  for (const [key, value] of Object.entries(buildArgs)) args.push('--build-arg', `${key}=${value}`);
  args.push('.');
  const result = run('docker', args, { env: { ...process.env, ...env }, stdio: 'inherit' });
  return result.status === 0;
}

/** Real health probes, gathered from containers or published ports. */
export async function probeStack(project, envFile, env, webPort) {
  const probes = [];
  try {
    const response = await fetch(`http://127.0.0.1:${webPort}/api/v1/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.json();
    probes.push({
      name: 'web',
      target: '/api/v1/health',
      ok: response.ok,
      detail: `HTTP ${String(response.status)} · status=${String(body.status)} · database=${String(body.database)} · commit=${String(body.commit)}`,
    });
  } catch (error) {
    probes.push({ name: 'web', target: '/api/v1/health', ok: false, detail: String(error) });
  }
  const execProbes = [
    ['worker', ['exec', '-T', 'worker', 'node', '/app/healthcheck.mjs'], '/health'],
    [
      'postgres',
      ['exec', '-T', 'db', 'pg_isready', '-U', 'postgres', '-d', 'postgres'],
      'pg_isready',
    ],
    ['inngest', ['exec', '-T', 'inngest', 'perl', '/healthcheck.pl'], '/health'],
  ];
  for (const [name, args, target] of execProbes) {
    const result = run('docker', composeCommand(project, envFile, args), { env });
    probes.push({
      name,
      target,
      ok: result.status === 0,
      detail: redact(
        (result.stdout ?? '').trim() ||
          `${(result.stderr ?? '').trim() || 'sans sortie'} (code ${String(result.status ?? 1)})`,
        env,
      ),
    });
  }
  return probes;
}

export async function collectStatus({ project, envFile, env, webPort }) {
  const ps = composePs(project, envFile, env);
  const services = ps.services.map((service) => ({
    name: service.Service ?? service.Name,
    state: service.State ?? 'unknown',
    health: service.Health ?? '',
    image: service.Image ?? '',
  }));
  const webInfo = serviceImageInfo(project, envFile, env, 'web');
  const workerInfo = serviceImageInfo(project, envFile, env, 'worker');
  const images = [
    {
      name: 'web',
      tag: webInfo?.image ?? env.LEARNY_WEB_IMAGE ?? 'Non vérifié',
      version: webInfo?.labels['org.opencontainers.image.version'] ?? 'Non vérifié',
      commit: webInfo?.labels['org.opencontainers.image.revision'] ?? 'Non vérifié',
      user: webInfo?.user ?? 'Non vérifié',
    },
    {
      name: 'worker',
      tag: workerInfo?.image ?? env.LEARNY_WORKER_IMAGE ?? 'Non vérifié',
      version: workerInfo?.labels['org.opencontainers.image.version'] ?? 'Non vérifié',
      commit: workerInfo?.labels['org.opencontainers.image.revision'] ?? 'Non vérifié',
      user: workerInfo?.user ?? 'Non vérifié',
    },
  ];
  const probes = await probeStack(project, envFile, env, webPort);
  return {
    generatedAt: toolNow().toISOString(),
    project,
    source: 'up',
    docker: true,
    services,
    servicesError: ps.error ?? null,
    images,
    health: probes,
    volumes: projectVolumes(project),
  };
}

export function writeStatus(status) {
  fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2) + '\n');
}

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : fallback;
}

async function main() {
  const envFileOption = option('env-file', '.env.selfhost');
  const project = option('project', 'learny-selfhost');
  const up = process.argv.includes('--up');
  const json = process.argv.includes('--json');
  const timeoutMs = Number(option('timeout', '300000'));
  const errors = [];

  const composeText = readFile(COMPOSE_FILE);
  let doc;
  try {
    doc = parseComposeYaml(composeText);
  } catch (error) {
    errors.push(`compose : ${error instanceof Error ? error.message : String(error)}`);
    doc = null;
  }
  if (doc !== null) errors.push(...validateComposeDocument(doc, composeText));
  errors.push(...validateDockerfile(readFile('docker/web.Dockerfile')));
  errors.push(...validateDockerfile(readFile('docker/worker.Dockerfile')));
  errors.push(...validateDockerignore(readFile(DOCKERIGNORE_FILE)));
  errors.push(...validateGuide(readFile(GUIDE_FILE)));

  let env = {};
  let envPath = envFileOption;
  try {
    const loaded = loadEnvFile(envFileOption);
    envPath = loaded.path;
    env = { ...loaded.vars, ...process.env };
    const missing = missingRequiredVariables(composeText, env);
    for (const name of missing) errors.push(`variable obligatoire absente : ${name}`);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  if (errors.length === 0 && dockerAvailable()) {
    const resolved = composeConfig(envPath, env);
    if (!resolved.ok) errors.push(`docker compose config : ${resolved.error ?? 'échec'}`);
    else errors.push(...validateResolvedConfig(resolved.config));
  } else if (!dockerAvailable()) {
    console.warn('Docker indisponible : validation statique seulement (CL-7).');
    if (up) errors.push('Docker est requis pour --up : aucun démarrage inventé.');
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`✖ ${error}`);
    process.exit(1);
  }
  console.log('✔ configuration auto-hébergée valide (Compose, Dockerfiles, guide).');

  if (!up) return;

  const webPort = env.LEARNY_WEB_PORT ?? '8080';
  console.log(`Démarrage réel du projet ${project}…`);
  if (!composeUp(project, envPath, env, { build: true })) {
    console.error('✖ docker compose up a échoué.');
    process.exit(1);
  }
  const ready = await waitForStack(project, envPath, env, timeoutMs);
  if (!ready.ok) {
    console.error('✖ la pile n’est pas saine avant la fin du délai.');
    for (const service of ready.services) {
      console.error(
        `  ${service.Service ?? service.Name} : ${service.State} ${service.Health ?? ''}`,
      );
    }
    process.exit(1);
  }
  const status = await collectStatus({ project, envFile: envPath, env, webPort });
  writeStatus(status);
  for (const probe of status.health) {
    console.log(`${probe.ok ? '✔' : '✖'} ${probe.name} ${probe.target} — ${probe.detail}`);
  }
  if (json) console.log(JSON.stringify(status, null, 2));
  const failed = status.health.filter((probe) => !probe.ok);
  if (failed.length > 0) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))
  void main();
