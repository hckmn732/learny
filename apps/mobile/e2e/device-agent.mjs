#!/usr/bin/env node
// Device agent of the dual-VM setup (SPEC-3001 EF-5, ADR-3012).
//
// The emulator lives on its own machine (`i96p0dwzbg`); the repository, the API and the SDD loop
// live on the development machine. This agent exposes the adb/maestro steps of
// `run-maestro.mjs` over HTTP so that `pnpm test:e2e:mobile` (and therefore
// `tools/sdd/validate.mjs`) really drives the device instead of trusting a copied report.
//
// Usage, on the machine that owns the emulator:
//   DEVICE_AGENT_TOKEN=<secret> node apps/mobile/e2e/device-agent.mjs --port 8098
//
// Routes (POST, JSON):
//   /device    {}                                  -> { ok, detail, device }
//   /install   { apkUrl }                          -> { ok, detail }
//   /freeze    {}                                  -> { ok, detail }
//   /maestro   { tags, flows[], recordVideo }      -> { status, stdout, stderr, junit, artifacts[] }
//
// Every request must carry `x-device-token` when DEVICE_AGENT_TOKEN is set. The agent never
// returns a secret and never reads the repository: it only writes in its own temporary directory.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const TOKEN = process.env.DEVICE_AGENT_TOKEN ?? '';
const ADB = process.env.ADB ?? 'adb';
const WORK_DIR = process.env.DEVICE_AGENT_DIR ?? path.join(os.tmpdir(), 'learny-device-agent');
const APK = path.join(WORK_DIR, 'app-e2e.apk');
const FLOWS = path.join(WORK_DIR, 'flows');
const JUNIT = path.join(WORK_DIR, 'maestro-junit.xml');

function arg(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

const PORT = Number(arg('--port', process.env.DEVICE_AGENT_PORT ?? '8098'));

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function device() {
  const { stdout } = run(ADB, ['devices']);
  const line = stdout
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry.endsWith('device') && !entry.startsWith('List'));
  return {
    serial: line === undefined ? null : (line.split(/\s+/)[0] ?? null),
    model: run(ADB, ['shell', 'getprop', 'ro.product.model']).stdout.trim(),
    apiLevel: run(ADB, ['shell', 'getprop', 'ro.build.version.sdk']).stdout.trim(),
    size: run(ADB, ['shell', 'wm', 'size']).stdout.trim(),
    platform: 'android',
  };
}

function ensureDevice() {
  const current = device();
  if (current.serial !== null) return { ok: true, detail: 'appareil connecté', device: current };

  const avd = process.env.DEVICE_AGENT_AVD ?? 'agent37';
  if (run('which', ['emulator']).status !== 0) {
    return { ok: false, detail: 'ni appareil adb ni binaire emulator', device: current };
  }
  const child = spawn('emulator', ['-avd', avd, '-no-window', '-no-audio', '-no-boot-anim'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const next = device();
    if (next.serial !== null) return { ok: true, detail: `AVD ${avd} démarré`, device: next };
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3_000);
  }
  return { ok: false, detail: `AVD ${avd} non démarré en 240 s`, device: current };
}

function freeze() {
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
  for (const command of commands) run(ADB, command, { timeout: 30_000 });
  return { ok: true, detail: 'barre d’état figée (13:20, réseau et batterie pleins)' };
}

function download(apkUrl) {
  if (typeof apkUrl !== 'string' || !/^https?:\/\//.test(apkUrl)) {
    return { ok: false, detail: 'apkUrl http(s) attendue' };
  }
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const result = run('curl', ['-fsSL', '--max-time', '600', '-o', APK, apkUrl], {
    timeout: 660_000,
  });
  if (result.status !== 0)
    return { ok: false, detail: `téléchargement impossible : ${result.stderr.trim()}` };
  return { ok: true, detail: `APK téléchargé (${String(fs.statSync(APK).size)} octets)` };
}

function install() {
  const result = run(ADB, ['install', '-r', '-d', APK], { timeout: 600_000 });
  return {
    ok: result.status === 0,
    detail: (result.stdout || result.stderr).trim().split('\n').pop() ?? '',
  };
}

function collectArtifacts(baseNames) {
  const dir = path.join(os.homedir(), '.maestro', 'tests');
  if (!fs.existsSync(dir)) return [];
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(png|mp4)$/.test(entry.name)) files.push(full);
    }
  };
  walk(dir);
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  const wanted = [
    ...baseNames.map((name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
    'screen',
    'recording',
  ];
  return files
    .filter((file) => {
      const base = path
        .basename(file)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
      return wanted.some((name) => base.includes(name));
    })
    .slice(0, 12)
    .map((file) => ({
      name: path.basename(file),
      base64: fs.readFileSync(file).toString('base64'),
    }));
}

function screenshot(name) {
  const result = spawnSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0 || !result.stdout) return null;
  return { name: `${name}.png`, base64: Buffer.from(result.stdout).toString('base64') };
}

function maestro(body) {
  fs.rmSync(FLOWS, { recursive: true, force: true });
  fs.mkdirSync(FLOWS, { recursive: true });
  const baseNames = [];
  for (const flow of body.flows ?? []) {
    const file = path.join(FLOWS, path.basename(String(flow.file)));
    fs.writeFileSync(file, String(flow.content));
    baseNames.push(path.basename(file, '.yaml'));
  }

  const tags = (body.tags ?? []).map(String);
  fs.rmSync(JUNIT, { force: true });

  let recording = null;
  if (body.recordVideo === true) {
    const videoFile = `/sdcard/${baseNames[0] ?? 'e2e'}.mp4`;
    recording = {
      file: videoFile,
      process: spawn(ADB, ['shell', 'screenrecord', '--time-limit', '180', videoFile], {
        stdio: 'ignore',
      }),
    };
  }

  const binary = process.env.MAESTRO ?? path.join(os.homedir(), '.maestro', 'bin', 'maestro');
  const command = fs.existsSync(binary) ? binary : 'maestro';
  const result = run(
    command,
    ['test', '--include-tags', tags.join(','), '--format', 'junit', '--output', JUNIT, FLOWS],
    { timeout: 900_000, env: { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1' } },
  );

  const artifacts = [];
  if (recording !== null) {
    spawnSync(ADB, ['shell', 'pkill', '-INT', 'screenrecord'], { timeout: 20_000 });
    recording.process.kill();
    const local = path.join(WORK_DIR, `${baseNames[0] ?? 'e2e'}.mp4`);
    const pull = spawnSync(ADB, ['pull', recording.file, local], { timeout: 120_000 });
    run(ADB, ['shell', 'rm', '-f', recording.file]);
    if (pull.status === 0 && fs.existsSync(local)) {
      artifacts.push({
        name: path.basename(local),
        base64: fs.readFileSync(local).toString('base64'),
      });
    }
  }
  for (const name of baseNames) {
    const shot = screenshot(name);
    if (shot !== null) artifacts.push(shot);
  }
  artifacts.push(...collectArtifacts(baseNames));

  return {
    status: result.status,
    stdout: result.stdout.slice(-4000),
    stderr: result.stderr.slice(-4000),
    junit: fs.existsSync(JUNIT) ? fs.readFileSync(JUNIT, 'utf8') : '',
    artifacts,
  };
}

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

const server = http.createServer((request, response) => {
  if (request.method !== 'POST') {
    json(response, 405, { error: 'POST attendu' });
    return;
  }
  if (!authorized(request)) {
    json(response, 401, { error: 'jeton invalide' });
    return;
  }

  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      if (request.url === '/device') {
        const ready = ensureDevice();
        json(response, 200, ready);
      } else if (request.url === '/install') {
        const downloaded = download(body.apkUrl);
        json(response, 200, downloaded.ok ? install() : downloaded);
      } else if (request.url === '/freeze') {
        json(response, 200, freeze());
      } else if (request.url === '/maestro') {
        json(response, 200, maestro(body));
      } else {
        json(response, 404, { error: `route inconnue : ${String(request.url)}` });
      }
    } catch (error) {
      json(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
});

fs.mkdirSync(WORK_DIR, { recursive: true });
server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `agent appareil à l’écoute sur http://0.0.0.0:${String(PORT)} (jeton ${TOKEN === '' ? 'absent' : 'requis'})`,
  );
});
