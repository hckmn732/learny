#!/usr/bin/env node
// Device agent of the dual-VM setup (SPEC-3001 EF-5, ADR-3012, précisé par ADR-3015 § 1 et § 2).
//
// The emulator lives on its own machine (`i96p0dwzbg`); the repository, the API and the SDD loop
// live on the development machine. This agent exposes the adb/maestro steps of
// `run-maestro.mjs` over HTTP so that `pnpm test:e2e:mobile` (and therefore
// `tools/sdd/validate.mjs`) really drives the device instead of trusting a copied report.
//
// Usage, on the machine that owns the emulator:
//   DEVICE_AGENT_TOKEN=<secret> node apps/mobile/e2e/device-agent.mjs --port 8098
//
// Routes:
//   GET  /health                         -> { ok, version, busy, queued, jobId, uptimeSec }
//   GET  /jobs                           -> { jobs: [{ id, status, tags, flows, createdAt }] }
//   POST /device    {}                   -> { ok, detail, device }
//   POST /install   { apkUrl }           -> { ok, detail }
//   POST /freeze    {}                   -> { ok, detail }
//   POST /maestro   { tags, flows[], recordVideo, sync? }
//                                        -> 202 { jobId, status: 'queued' }   (travail asynchrone)
//   GET  /maestro/:id[?artifacts=0]      -> { id, status, progress, exitCode, junit, artifacts[] }
//   POST /maestro/:id/cancel             -> { ok, status }
//
// Pourquoi des travaux asynchrones (ADR-3015 § 1) : l'edge qui publie ce port coupe les requêtes
// de 28 à 120 s, et une campagne Maestro dure de 30 s à plusieurs minutes. `POST /maestro` rend
// donc un identifiant immédiatement, le lanceur scrute `GET /maestro/:id`, et **aucune requête ne
// dure plus que le temps d'un démarrage de campagne**. `sync: true` reste accepté pour rejouer une
// campagne avec l'ancien lanceur (il subit alors la coupure d'edge, par construction).
//
// Pourquoi une file d'attente (ADR-3015 § 1) : Maestro et l'émulateur sont uniques. Un Maestro
// fantôme bloquait toutes les campagnes suivantes ; ici les travaux sont sérialisés, les fantômes
// sont tués avant chaque campagne et un travail trop long est interrompu.
//
// Chaque artefact porte le flux qui l'a produit (ADR-3015 § 2) : `{ flow, kind, path, name, base64 }`
// où `flow` est le `name:` du flux ou `null` pour la vidéo de campagne. `junit` est le fichier écrit
// par Maestro, relu octet pour octet, jamais reconstruit.
//
// Every request must carry `x-device-token` when DEVICE_AGENT_TOKEN is set. The agent never
// returns a secret and never reads the repository: it only writes in its own temporary directory.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { attributeArtifacts, flowSlug } from './artifacts.mjs';

const VERSION = '2';
const TOKEN = process.env.DEVICE_AGENT_TOKEN ?? '';
const ADB = process.env.ADB ?? 'adb';
const WORK_DIR = process.env.DEVICE_AGENT_DIR ?? path.join(os.tmpdir(), 'learny-device-agent');
const JOBS_DIR = path.join(WORK_DIR, 'jobs');
const APK = path.join(WORK_DIR, 'app-e2e.apk');
/** Durée maximale d'une campagne côté agent : au-delà, Maestro est tué et le travail échoue. */
const JOB_TIMEOUT_MS = Number(process.env.DEVICE_AGENT_JOB_TIMEOUT_MS ?? 1_500_000);
/** Nombre de travaux terminés conservés (mémoire de l'agent). */
const KEEP_JOBS = 8;

function arg(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

const PORT = Number(arg('--port', process.env.DEVICE_AGENT_PORT ?? '8098'));
const STARTED_AT = Date.now();

// ---------------------------------------------------------------------------------------------
// Process helpers.

/** Exécute une commande en capturant stdout/stderr (borné à 4000 caractères chacun). */
function run(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...(options.env ?? {}) } });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer =
      options.timeoutMs === undefined
        ? null
        : setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
          }, options.timeoutMs);
    child.stdout?.on('data', (chunk) => {
      stdout = `${stdout}${String(chunk)}`.slice(-4000);
    });
    child.stderr?.on('data', (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-4000);
    });
    child.on('error', (error) => {
      if (timer !== null) clearTimeout(timer);
      resolve({ status: 127, stdout, stderr: `${stderr}${String(error.message)}`, timedOut });
    });
    child.on('close', (code) => {
      if (timer !== null) clearTimeout(timer);
      resolve({ status: timedOut ? 124 : (code ?? 1), stdout, stderr, timedOut });
    });
    options.onChild?.(child);
  });
}

/** `adb devices` : premier appareil prêt, ou `null`. */
async function device() {
  const { stdout } = await run(ADB, ['devices']);
  const line = stdout
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry.endsWith('device') && !entry.startsWith('List'));
  const props = await Promise.all([
    run(ADB, ['shell', 'getprop', 'ro.product.model']),
    run(ADB, ['shell', 'getprop', 'ro.build.version.sdk']),
    run(ADB, ['shell', 'wm', 'size']),
  ]);
  return {
    serial: line === undefined ? null : (line.split(/\s+/)[0] ?? null),
    model: props[0].stdout.trim(),
    apiLevel: props[1].stdout.trim(),
    size: props[2].stdout.trim(),
    platform: 'android',
  };
}

async function ensureDevice() {
  const current = await device();
  if (current.serial !== null) return { ok: true, detail: 'appareil connecté', device: current };

  const avd = process.env.DEVICE_AGENT_AVD ?? 'agent37';
  const which = await run('which', ['emulator']);
  if (which.status !== 0)
    return { ok: false, detail: 'ni appareil adb ni binaire emulator', device: current };

  const child = spawn('emulator', ['-avd', avd, '-no-window', '-no-audio', '-no-boot-anim'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const next = await device();
    if (next.serial !== null) return { ok: true, detail: `AVD ${avd} démarré`, device: next };
  }
  return { ok: false, detail: `AVD ${avd} non démarré en 240 s`, device: current };
}

async function freeze() {
  const commands = [
    ['shell', 'settings', 'put', 'system', 'system_locales', 'fr-FR'],
    ['shell', 'setprop', 'persist.sys.timezone', 'Europe/Paris'],
    ['shell', 'settings', 'put', 'global', 'sysui_demo_allowed', '1'],
    ['shell', 'am', 'broadcast', '-a', 'com.android.systemui.demo', '-e', 'command', 'enter'],
    [
      'shell',
      'am',
      'broadcast',
      '-a',
      'com.android.systemui.demo',
      '-e',
      'command',
      'clock',
      '-e',
      'hhmm',
      '1320',
    ],
    [
      'shell',
      'am',
      'broadcast',
      '-a',
      'com.android.systemui.demo',
      '-e',
      'command',
      'battery',
      '-e',
      'level',
      '100',
      '-e',
      'plugged',
      'false',
    ],
    [
      'shell',
      'am',
      'broadcast',
      '-a',
      'com.android.systemui.demo',
      '-e',
      'command',
      'network',
      '-e',
      'wifi',
      'show',
      '-e',
      'level',
      '4',
    ],
    [
      'shell',
      'am',
      'broadcast',
      '-a',
      'com.android.systemui.demo',
      '-e',
      'command',
      'notifications',
      '-e',
      'visible',
      'false',
    ],
    ['shell', 'settings', 'put', 'system', 'time_12hour_format', '0'],
  ];
  for (const command of commands) await run(ADB, command, { timeoutMs: 30_000 });
  return { ok: true, detail: 'barre d’état figée (13:20, réseau et batterie pleins)' };
}

async function download(apkUrl) {
  if (typeof apkUrl !== 'string' || !/^https?:\/\//.test(apkUrl)) {
    return { ok: false, detail: 'apkUrl http(s) attendue' };
  }
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const result = await run('curl', ['-fsSL', '--max-time', '600', '-o', APK, apkUrl], {
    timeoutMs: 660_000,
  });
  if (result.status !== 0) {
    return { ok: false, detail: `téléchargement impossible : ${result.stderr.trim()}` };
  }
  return { ok: true, detail: `APK téléchargé (${String(fs.statSync(APK).size)} octets)` };
}

async function install() {
  const result = await run(ADB, ['install', '-r', '-d', APK], { timeoutMs: 600_000 });
  return {
    ok: result.status === 0,
    detail: (result.stdout || result.stderr).trim().split('\n').pop() ?? '',
  };
}

/**
 * Tue les Maestro et `screenrecord` fantômes laissés par une campagne interrompue (ADR-3015 § 1).
 * Sans cela, un Maestro orphelin occupe l'appareil et la campagne suivante échoue en
 * `container_unreachable`.
 */
async function killGhosts() {
  const killed = [];
  for (const pattern of ['maestro test', 'maestro.jar', 'screenrecord']) {
    const found = await run('pgrep', ['-f', pattern]);
    const pids = found.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^\d+$/.test(line));
    if (pids.length === 0) continue;
    await run('kill', ['-9', ...pids]);
    killed.push(`${pattern}: ${pids.join(',')}`);
  }
  await run(ADB, ['shell', 'pkill', '-f', 'screenrecord']);
  return killed;
}

// ---------------------------------------------------------------------------------------------
// Job store: one campaign at a time, FIFO.

/** @type {Map<string, object>} */
const jobs = new Map();
const pending = [];
let running = null;
let sequence = 0;

function newJobId() {
  sequence += 1;
  return `${new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14)}-${String(sequence).padStart(3, '0')}`;
}

function publicJob(job, { artifacts = true } = {}) {
  return {
    id: job.id,
    version: VERSION,
    status: job.status,
    progress: job.progress,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    tags: job.request.tags ?? [],
    flows: job.flows.map((flow) => flow.name),
    recordVideo: job.request.recordVideo === true,
    exitCode: job.exitCode ?? null,
    junit: job.junit ?? '',
    stdout: job.stdout ?? '',
    stderr: job.stderr ?? '',
    error: job.error ?? null,
    unattributed: job.unattributed ?? [],
    ...(artifacts ? { artifacts: job.artifacts ?? [] } : {}),
  };
}

function forgetOldJobs() {
  const finished = [...jobs.values()]
    .filter((job) => job.status !== 'queued' && job.status !== 'running')
    .sort((a, b) => String(a.finishedAt ?? '').localeCompare(String(b.finishedAt ?? '')));
  for (const job of finished.slice(0, Math.max(0, finished.length - KEEP_JOBS))) {
    jobs.delete(job.id);
    fs.rmSync(path.join(JOBS_DIR, job.id), { recursive: true, force: true });
  }
}

function enqueue(request) {
  const job = {
    id: newJobId(),
    status: 'queued',
    progress: 'en file d’attente',
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    request,
    flows: (request.flows ?? []).map((flow) => ({
      name: String(flow.name ?? path.basename(String(flow.file), '.yaml')),
      file: path.basename(String(flow.file)),
      content: String(flow.content ?? ''),
    })),
    exitCode: null,
    junit: '',
    stdout: '',
    stderr: '',
    artifacts: [],
    error: null,
    child: null,
    cancelled: false,
    done: null,
  };
  let settle;
  job.done = new Promise((resolve) => {
    settle = resolve;
  });
  job.settle = () => settle(job);
  jobs.set(job.id, job);
  pending.push(job);
  void pump();
  return job;
}

async function pump() {
  if (running !== null) return;
  const job = pending.shift();
  if (job === undefined) return;
  if (job.cancelled) {
    void pump();
    return;
  }
  running = job;
  try {
    await execute(job);
  } catch (error) {
    job.status = 'error';
    job.error = error instanceof Error ? error.message : String(error);
    job.finishedAt = new Date().toISOString();
    job.settle();
  } finally {
    running = null;
    forgetOldJobs();
    void pump();
  }
}

/** Répertoire de travail d'un travail : flux écrits, sortie Maestro, rapport JUnit. */
function prepareJobDir(job) {
  const dir = path.join(JOBS_DIR, job.id);
  fs.rmSync(dir, { recursive: true, force: true });
  const flowsDir = path.join(dir, 'flows');
  const outDir = path.join(dir, 'out');
  fs.mkdirSync(flowsDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const flow of job.flows) fs.writeFileSync(path.join(flowsDir, flow.file), flow.content);
  return { dir, flowsDir, outDir, junitPath: path.join(dir, 'junit.xml') };
}

/** Tous les fichiers d'artefact d'un répertoire, en chemins relatifs POSIX. */
function walkArtifactFiles(root) {
  const files = [];
  const walk = (current, prefix) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(path.join(current, entry.name), relative);
      else if (/\.(png|jpe?g|mp4|mov|webm)$/i.test(entry.name)) files.push(relative);
    }
  };
  if (fs.existsSync(root)) walk(root, '');
  return files.sort();
}

/**
 * Artefacts produits pendant la campagne, avec leur flux (ADR-3015 § 2). Maestro écrit
 * `--test-output-dir/<name du flux>/takeScreenshot|screenshots/…` : le rattachement est porté par
 * le chemin, jamais deviné.
 */
function collectArtifacts(outDir, job) {
  const flows = job.flows.map((flow) => ({ name: flow.name, file: flow.file }));
  const found = walkArtifactFiles(outDir).map((relative) => ({
    path: relative,
    name: path.basename(relative),
    base64: fs.readFileSync(path.join(outDir, relative)).toString('base64'),
    kind: /\.(mp4|mov|webm)$/i.test(relative) ? 'video' : 'screenshot',
  }));
  const { byFlow, unattributed } = attributeArtifacts({ artifacts: found, flows });
  const attributed = [];
  for (const bucket of Object.values(byFlow)) {
    for (const artifact of [...bucket.screenshots, ...bucket.videos]) {
      attributed.push({ ...artifact, flow: bucket.flow.name });
    }
  }
  return { artifacts: attributed, unattributed };
}

/** Enregistre la campagne (une seule vidéo, rattachée à la campagne et non à un flux). */
async function startRecording(file) {
  const child = spawn(ADB, ['shell', 'screenrecord', '--time-limit', '180', file], {
    stdio: 'ignore',
  });
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  return child;
}

async function stopRecording(child, file, jobDir) {
  await run(ADB, ['shell', 'pkill', '-INT', 'screenrecord'], { timeoutMs: 20_000 });
  child?.kill();
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  const local = path.join(jobDir, 'campaign.mp4');
  const pull = await run(ADB, ['pull', file, local], { timeoutMs: 120_000 });
  await run(ADB, ['shell', 'rm', '-f', file], { timeoutMs: 20_000 });
  if (pull.status !== 0 || !fs.existsSync(local)) return null;
  return {
    flow: null,
    kind: 'video',
    path: 'campaign.mp4',
    name: 'campaign.mp4',
    base64: fs.readFileSync(local).toString('base64'),
  };
}

async function execute(job) {
  job.status = 'running';
  job.startedAt = new Date().toISOString();
  const { dir, flowsDir, outDir, junitPath } = prepareJobDir(job);

  const ghosts = await killGhosts();
  job.progress =
    ghosts.length === 0 ? 'maestro' : `maestro (fantômes tués : ${ghosts.join(' | ')})`;

  const binary = process.env.MAESTRO ?? path.join(os.homedir(), '.maestro', 'bin', 'maestro');
  const command = fs.existsSync(binary) ? binary : 'maestro';
  const tags = (job.request.tags ?? []).map(String).filter((tag) => tag !== '');
  const args = ['test', '--format', 'junit', '--output', junitPath, '--test-output-dir', outDir];
  if (tags.length > 0) args.push('--include-tags', tags.join(','));
  args.push(flowsDir);

  let recording = null;
  if (job.request.recordVideo === true) {
    job.progress = 'enregistrement vidéo';
    recording = await startRecording(`/sdcard/${flowSlug(job.id)}.mp4`);
  }

  job.progress = 'maestro';
  const result = await run(command, args, {
    timeoutMs: JOB_TIMEOUT_MS,
    env: { MAESTRO_CLI_NO_ANALYTICS: '1' },
    onChild: (child) => {
      job.child = child;
    },
  });
  job.child = null;

  if (job.cancelled) {
    job.status = 'cancelled';
    job.error = 'travail annulé par le lanceur';
  } else if (result.timedOut) {
    job.status = 'error';
    job.error = `campagne interrompue après ${String(Math.round(JOB_TIMEOUT_MS / 1000))} s (DEVICE_AGENT_JOB_TIMEOUT_MS)`;
  } else if (result.status === 127) {
    job.status = 'error';
    job.error = `maestro introuvable : ${result.stderr.trim()}`;
  } else {
    job.exitCode = result.status;
    job.status = result.status === 0 ? 'done' : 'failed';
  }

  job.stdout = result.stdout;
  job.stderr = result.stderr;

  if (recording !== null) {
    job.progress = 'collecte de la vidéo';
    const video = await stopRecording(recording, `/sdcard/${flowSlug(job.id)}.mp4`, dir);
    if (video !== null) job.artifacts.push(video);
  }

  job.progress = 'collecte des artefacts';
  const collected = collectArtifacts(outDir, job);
  job.artifacts.push(...collected.artifacts);
  job.unattributed = collected.unattributed.map((entry) => ({
    name: entry.artifact.name,
    path: entry.artifact.path ?? null,
    reason: entry.reason,
  }));

  // Le rapport JUnit est relu tel quel : Maestro l'a écrit une fois, on ne le reconstruit pas.
  job.junit = fs.existsSync(junitPath) ? fs.readFileSync(junitPath, 'utf8') : '';
  if (job.junit === '' && job.status === 'done') {
    job.status = 'error';
    job.error = 'Maestro a rendu 0 sans rapport JUnit : campagne non prouvée (ADR-3015 § 3)';
  }

  job.finishedAt = new Date().toISOString();
  job.progress = 'terminé';
  job.settle();
}

// ---------------------------------------------------------------------------------------------
// HTTP.

function authorized(request) {
  if (TOKEN === '') return true;
  const provided = request.headers['x-device-token'];
  if (typeof provided !== 'string' || provided.length !== TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(TOKEN));
}

function json(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

function health() {
  return {
    ok: true,
    version: VERSION,
    pid: process.pid,
    uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
    busy: running !== null,
    queued: pending.length,
    jobId: running?.id ?? null,
    status: running === null ? 'idle' : 'busy',
  };
}

async function route(request, response) {
  const url = new URL(request.url ?? '/', 'http://agent');
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (!authorized(request)) {
    json(response, 401, { error: 'jeton invalide' });
    return;
  }

  if (request.method === 'GET' && pathname === '/health') {
    json(response, 200, health());
    return;
  }
  if (request.method === 'GET' && pathname === '/jobs') {
    json(response, 200, {
      jobs: [...jobs.values()].map((job) => ({
        id: job.id,
        status: job.status,
        progress: job.progress,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        tags: job.request.tags ?? [],
        flows: job.flows.map((flow) => flow.name),
      })),
    });
    return;
  }

  const jobRoute = /^\/maestro\/([^/]+)(\/cancel)?$/.exec(pathname);
  if (request.method === 'GET' && jobRoute !== null && jobRoute[2] === undefined) {
    const job = jobs.get(decodeURIComponent(jobRoute[1] ?? ''));
    if (job === undefined) {
      json(response, 404, { error: `travail inconnu : ${jobRoute[1]}` });
      return;
    }
    const withArtifacts = url.searchParams.get('artifacts') !== '0';
    json(response, 200, publicJob(job, { artifacts: withArtifacts }));
    return;
  }
  if (request.method === 'POST' && jobRoute !== null && jobRoute[2] === '/cancel') {
    const job = jobs.get(decodeURIComponent(jobRoute[1] ?? ''));
    if (job === undefined) {
      json(response, 404, { error: `travail inconnu : ${jobRoute[1]}` });
      return;
    }
    job.cancelled = true;
    if (job.status === 'queued') {
      job.status = 'cancelled';
      job.finishedAt = new Date().toISOString();
      job.settle();
    }
    job.child?.kill('SIGKILL');
    await killGhosts();
    json(response, 200, { ok: true, status: job.status });
    return;
  }

  if (request.method !== 'POST') {
    json(response, 405, { error: 'POST attendu' });
    return;
  }

  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    void (async () => {
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {
        json(response, 400, { error: 'corps JSON invalide' });
        return;
      }
      try {
        if (pathname === '/device') {
          json(response, 200, await ensureDevice());
        } else if (pathname === '/install') {
          const downloaded = await download(body.apkUrl);
          json(response, 200, downloaded.ok ? await install() : downloaded);
        } else if (pathname === '/freeze') {
          json(response, 200, await freeze());
        } else if (pathname === '/maestro') {
          if (body.sync === true) {
            // Contrat historique (ADR-3012) : l'ancien lanceur attend la fin dans une seule
            // requête. Conservé pour rejouer une campagne d'une branche antérieure.
            const job = enqueue(body);
            const done = await job.done;
            json(response, 200, {
              status: done.exitCode ?? (done.status === 'done' ? 0 : 1),
              stdout: done.stdout,
              stderr: done.stderr,
              junit: done.junit,
              artifacts: done.artifacts.map((artifact) => ({
                flow: artifact.flow,
                name: artifact.name,
                base64: artifact.base64,
              })),
            });
            return;
          }
          const job = enqueue(body);
          json(response, 202, {
            jobId: job.id,
            status: job.status,
            queuePosition: pending.indexOf(job) + (running === null ? 0 : 1),
            poll: `/maestro/${job.id}`,
          });
        } else {
          json(response, 404, { error: `route inconnue : ${pathname}` });
        }
      } catch (error) {
        json(response, 500, { error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });
}

const server = http.createServer((request, response) => {
  route(request, response).catch((error) => {
    try {
      json(response, 500, { error: error instanceof Error ? error.message : String(error) });
    } catch {
      response.destroy();
    }
  });
});

fs.mkdirSync(JOBS_DIR, { recursive: true });
server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `agent appareil v${VERSION} à l’écoute sur http://0.0.0.0:${String(PORT)} ` +
      `(jeton ${TOKEN === '' ? 'absent' : 'requis'}, travaux asynchrones, ${String(JOBS_DIR)})`,
  );
});
