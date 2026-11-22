#!/usr/bin/env node
// Maestro runner of the mobile track (SPEC-3001 EF-5, CL-3, CL-4 ; ADR-3012, ADR-3015).
//
// Usage (through `pnpm test:e2e:mobile`, précédé du préflight `tools/dev/mobile-preflight.mjs`) :
//   node apps/mobile/e2e/run-maestro.mjs --tags SPEC-3001 [--platform android] [--apk <path>]
//                                        [--flows <dir>] [--record-video]
//
// Steps: check (or start) the emulator, install the `e2e` build, freeze the status bar (canevas
// § 5), run `maestro test --include-tags` in JUnit mode with `--test-output-dir`, keep the JUnit
// report verbatim, associate every artifact with the flow that produced it, run the visual
// comparison of the flows tagged `visual` against `e2e/visual/baselines/`, then write
// `test-results/sdd/<SPEC>/e2e-mobile.json` = `{ passed, failed, videos, visual, flows[] }`.
//
// Two transports, same contract:
//   - local (default): `adb` and `maestro` are on this machine;
//   - remote: `MOBILE_DEVICE_AGENT_URL` points at `e2e/device-agent.mjs` running on the machine
//     that owns the emulator (the dual-VM setup of this project, ADR-3012). The campaign is an
//     asynchronous job (ADR-3015 § 1) : `POST /maestro` rend un `jobId`, le lanceur scrute
//     `GET /maestro/<jobId>` ; aucune requête ne dure plus de quelques secondes. The APK is pulled
//     by the agent from `MOBILE_APK_URL`, a signed URL of the development machine.
//
// Le JUnit est la seule source du statut des flux (ADR-3015 § 3) : un rapport absent, vide ou sans
// `<testcase>` fait échouer la campagne explicitement, et un flux sans cas est `missing`.
//
// Exit codes: 0 campaign passed, 1 campaign failed, 2 misuse or no emulator (CL-4).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

import { AgentProtocolError, AgentTimeoutError, createAgentClient } from './agent-client.mjs';
import { attributeArtifacts, flowSlug, screenshotsForFlow, videosForFlow } from './artifacts.mjs';
import { parseFlowHeader } from './flows.mjs';
import { junitProblem, parseJunit } from './maestro-junit.mjs';
import { compareFlows } from './visual/compare.mjs';

export { parseFlowHeader } from './flows.mjs';
export { junitProblem, parseJunit } from './maestro-junit.mjs';
export { parseJunit as readJunit };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, '..');
const ROOT = path.resolve(APP_DIR, '..', '..');
const FLOWS_DIR = path.join(APP_DIR, 'e2e', 'flows');
const BASELINES_DIR = path.join(APP_DIR, 'e2e', 'visual', 'baselines');
const DEFAULT_APK = path.join(
  APP_DIR,
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'release',
  'app-release.apk',
);

/** Environment file of the operator (never committed): `KEY=value` lines. */
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

function config(argv) {
  const fileEnv = readEnvFile();
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const name = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[name] = next;
      i += 1;
    } else {
      flags[name] = true;
    }
  }

  const env = { ...fileEnv, ...process.env };
  const tags = String(flags.tags ?? env.MOBILE_TAGS ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  return {
    tags,
    platform: String(flags.platform ?? env.MOBILE_PLATFORM ?? 'android'),
    apk: path.resolve(ROOT, String(flags.apk ?? env.MOBILE_APK ?? DEFAULT_APK)),
    apkUrl: env.MOBILE_APK_URL ?? null,
    flowsDir: path.resolve(ROOT, String(flags.flows ?? env.MOBILE_FLOWS ?? FLOWS_DIR)),
    deviceAgentUrl: env.MOBILE_DEVICE_AGENT_URL ?? null,
    deviceAgentToken: env.MOBILE_DEVICE_AGENT_TOKEN ?? null,
    // Aucune requête HTTP ne dépasse ce délai (ADR-3015 § 1) ; le travail, lui, peut durer.
    agentRequestTimeoutMs: Number(
      env.MOBILE_DEVICE_AGENT_REQUEST_TIMEOUT_MS ?? env.MOBILE_DEVICE_AGENT_TIMEOUT_MS ?? 5_000,
    ),
    agentJobTimeoutMs: Number(env.MOBILE_DEVICE_AGENT_JOB_TIMEOUT_MS ?? 1_800_000),
    agentPollIntervalMs: Number(env.MOBILE_DEVICE_AGENT_POLL_INTERVAL_MS ?? 2_000),
    avd: env.MOBILE_AVD ?? 'agent37',
    recordVideo: flags['record-video'] !== undefined || env.MOBILE_RECORD_VIDEO === '1',
  };
}

/** `SPEC-3xxx` of the campaign: its report and evidence live under its name (CL-3). */
function specOf(tags) {
  return tags.find((tag) => /^SPEC-3\d{3}$/.test(tag)) ?? null;
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/** Flow headers of a directory, sorted by file name. */
function readFlows(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
    .sort()
    .map((file) => ({
      file,
      ...parseFlowHeader(fs.readFileSync(path.join(dir, file), 'utf8')),
    }));
}

// ---------------------------------------------------------------------------------------------
// Transports.

/** Runs adb and maestro on this machine. */
class LocalDevice {
  constructor(cfg) {
    this.cfg = cfg;
    this.adb = process.env.ADB ?? 'adb';
    this.info_ = { platform: cfg.platform };
  }

  device() {
    const { stdout } = run(this.adb, ['devices']);
    const line = stdout
      .split('\n')
      .map((entry) => entry.trim())
      .find((entry) => entry.endsWith('device') && !entry.startsWith('List'));
    return line === undefined ? null : (line.split(/\s+/)[0] ?? null);
  }

  ensure() {
    if (this.device() !== null) return { ok: true, detail: 'appareil connecté' };
    const emulator = run('which', ['emulator']);
    if (emulator.status !== 0) return { ok: false, detail: 'ni appareil adb ni binaire emulator' };

    const child = spawn(
      'emulator',
      ['-avd', this.cfg.avd, '-no-window', '-no-audio', '-no-boot-anim', '-no-snapshot-save'],
      { detached: true, stdio: 'ignore' },
    );
    child.unref();

    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline) {
      if (this.device() !== null) return { ok: true, detail: `AVD ${this.cfg.avd} démarré` };
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3_000);
    }
    return { ok: false, detail: `AVD ${this.cfg.avd} non démarré en 240 s` };
  }

  info() {
    const model = run(this.adb, ['shell', 'getprop', 'ro.product.model']).stdout.trim();
    const apiLevel = run(this.adb, ['shell', 'getprop', 'ro.build.version.sdk']).stdout.trim();
    const size = run(this.adb, ['shell', 'wm', 'size']).stdout.trim();
    return { platform: this.cfg.platform, model, apiLevel, size };
  }

  install(apkPath) {
    if (!fs.existsSync(apkPath)) {
      return { ok: false, detail: `APK absent : ${path.relative(ROOT, apkPath)}` };
    }
    const result = run(this.adb, ['install', '-r', '-d', apkPath], { timeout: 300_000 });
    return {
      ok: result.status === 0,
      detail: (result.stdout || result.stderr).trim().split('\n').pop() ?? '',
    };
  }

  freeze() {
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
    for (const command of commands) run(this.adb, command, { timeout: 30_000 });
    return { ok: true, detail: 'barre d’état figée (13:20, réseau et batterie pleins)' };
  }

  /** Lance Maestro une fois : rapport JUnit et sortie par flux dans `outputDir` (ADR-3015 § 2). */
  maestro(tags, flowsDir, junitPath, outputDir) {
    const binary = process.env.MAESTRO ?? path.join(os.homedir(), '.maestro', 'bin', 'maestro');
    const command = fs.existsSync(binary) ? binary : 'maestro';
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.mkdirSync(outputDir, { recursive: true });
    const result = run(
      command,
      [
        'test',
        '--include-tags',
        tags.join(','),
        '--format',
        'junit',
        '--output',
        junitPath,
        '--test-output-dir',
        outputDir,
        flowsDir,
      ],
      { timeout: 900_000, env: { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1' } },
    );
    return { ...result, artifacts: collectOutputArtifacts(outputDir) };
  }

  startVideo(name) {
    // Android's screenrecord stops by itself; the runner kills it when the flow ends.
    this.videoFile = `/sdcard/${name}.mp4`;
    this.video = spawn(this.adb, ['shell', 'screenrecord', '--time-limit', '180', this.videoFile], {
      stdio: 'ignore',
    });
    return { ok: true, detail: 'enregistrement vidéo démarré' };
  }

  stopVideo(name) {
    if (this.video !== undefined) {
      spawnSync(this.adb, ['shell', 'pkill', '-INT', 'screenrecord'], { timeout: 20_000 });
      this.video.kill();
      this.video = undefined;
    }
    const local = path.join(os.tmpdir(), `${name}.mp4`);
    const pull = spawnSync(this.adb, ['pull', this.videoFile, local], { timeout: 120_000 });
    run(this.adb, ['shell', 'rm', '-f', this.videoFile], { timeout: 20_000 });
    if (pull.status !== 0 || !fs.existsSync(local)) return null;
    const buffer = fs.readFileSync(local);
    fs.rmSync(local, { force: true });
    return { flow: null, kind: 'video', name: `${name}.mp4`, buffer };
  }
}

/** Fichiers de `--test-output-dir` (chemins relatifs POSIX) avec leur contenu. */
function collectOutputArtifacts(outputDir) {
  const files = [];
  const walk = (current, prefix) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(path.join(current, entry.name), relative);
      else if (/\.(png|jpe?g|mp4|mov|webm)$/i.test(entry.name)) files.push(relative);
    }
  };
  if (fs.existsSync(outputDir)) walk(outputDir, '');
  return files.sort().map((relative) => ({
    path: relative,
    name: path.basename(relative),
    buffer: fs.readFileSync(path.join(outputDir, relative)),
  }));
}

/** Runs the same steps on the machine that owns the emulator (ADR-3012, ADR-3015 § 1). */
class RemoteDevice {
  constructor(cfg) {
    this.cfg = cfg;
    this.info_ = { platform: cfg.platform };
    this.client = createAgentClient({
      baseUrl: cfg.deviceAgentUrl,
      token: cfg.deviceAgentToken,
      requestTimeoutMs: cfg.agentRequestTimeoutMs,
      pollIntervalMs: cfg.agentPollIntervalMs,
      jobTimeoutMs: cfg.agentJobTimeoutMs,
      log: (event) => logProgress(event),
    });
  }

  async ensure() {
    const result = await this.client.device();
    this.info_ = result.device ?? this.info_;
    return { ok: result.ok === true, detail: result.detail ?? '' };
  }

  info() {
    return this.info_;
  }

  async install() {
    const result = await this.client.install(this.cfg.apkUrl);
    return { ok: result.ok === true, detail: result.detail ?? '' };
  }

  async freeze() {
    const result = await this.client.freeze();
    return { ok: result.ok === true, detail: result.detail ?? '' };
  }

  /** Soumet la campagne, scrute son statut, rend le rapport et les artefacts par flux. */
  async campaign({ tags, flows, recordVideo }) {
    const done = await this.client.runMaestro({
      tags,
      recordVideo,
      flows: flows.map((flow) => ({ file: flow.file, name: flow.name, content: flow.content })),
    });
    return {
      jobId: done.jobId,
      status: done.status,
      junit: done.junit ?? '',
      stdout: done.stdout ?? '',
      stderr: done.stderr ?? '',
      error: done.error ?? null,
      artifacts: (done.artifacts ?? []).map((artifact) => ({
        flow: typeof artifact.flow === 'string' ? artifact.flow : null,
        path: artifact.path ?? null,
        name: artifact.name,
        buffer: Buffer.from(artifact.base64 ?? '', 'base64'),
      })),
    };
  }
}

/** Une ligne par changement d'état seulement : un travail de 3 min ne noie pas la sortie. */
let lastProgressLine = '';
function logProgress(event) {
  const line = `${String(event.status ?? '')} ${String(event.progress ?? event.note ?? '')}`.trim();
  if (line === lastProgressLine || line === '') return;
  lastProgressLine = line;
  console.log(`… ${line}`);
}

// ---------------------------------------------------------------------------------------------
// Campaign.

async function main() {
  const cfg = config(process.argv.slice(2));

  if (cfg.tags.length === 0) {
    console.error('✖ --tags <étiquette> obligatoire (ex. --tags SPEC-3001).');
    return 2;
  }
  const spec = specOf(cfg.tags);
  if (spec === null) {
    console.error(`✖ aucun flux SPEC-3xxx dans les étiquettes ${cfg.tags.join(', ')}.`);
    return 2;
  }

  const flows = readFlows(cfg.flowsDir);
  const selected = flows.filter((flow) => flow.tags.some((tag) => cfg.tags.includes(tag)));
  if (selected.length === 0) {
    console.error(
      `✖ aucun flux ${cfg.tags.join(', ')} dans ${path.relative(ROOT, cfg.flowsDir)} (CL-3).`,
    );
    return 2;
  }

  const outDir = path.join(ROOT, 'test-results', 'sdd', spec);
  // Only the files this campaign owns are replaced: `validate.mjs` writes the unit and integration
  // reports of the same specification into this directory before running the campaign.
  fs.rmSync(path.join(outDir, 'artifacts'), { recursive: true, force: true });
  for (const own of ['e2e-mobile.json', 'e2e-mobile.xml']) {
    fs.rmSync(path.join(outDir, own), { force: true });
  }
  fs.mkdirSync(path.join(outDir, 'artifacts'), { recursive: true });

  const device = cfg.deviceAgentUrl === null ? new LocalDevice(cfg) : new RemoteDevice(cfg);

  const ready = await device.ensure();
  if (!ready.ok) {
    console.error(`✖ émulateur indisponible : ${ready.detail} (CL-4)`);
    return 2;
  }
  console.log(`✔ émulateur : ${JSON.stringify(device.info())}`);

  if (device instanceof LocalDevice) {
    const installed = device.install(cfg.apk);
    if (!installed.ok) {
      console.error(`✖ installation impossible : ${installed.detail}`);
      return 2;
    }
    console.log(`✔ APK installé : ${path.relative(ROOT, cfg.apk)}`);
  } else {
    if (cfg.apkUrl === null) {
      console.error('✖ MOBILE_APK_URL est obligatoire en mode agent (URL signée de l’APK).');
      return 2;
    }
    const installed = await device.install();
    if (!installed.ok) {
      console.error(`✖ installation impossible : ${installed.detail}`);
      return 2;
    }
    console.log(`✔ APK installé depuis ${cfg.apkUrl}`);
  }

  const frozen = await device.freeze();
  console.log(`${frozen.ok ? '✔' : '…'} ${frozen.detail}`);

  const junitPath = path.join(outDir, 'e2e-mobile.xml');
  const outputDir = path.join(outDir, 'maestro-output');
  const startedAt = new Date().toISOString();
  let junit = '';
  let artifacts = [];
  let campaignVideo = null;
  let jobId = null;
  let transportError = null;

  try {
    if (device instanceof RemoteDevice) {
      const result = await device.campaign({
        tags: cfg.tags,
        flows: selected,
        recordVideo: cfg.recordVideo,
      });
      jobId = result.jobId;
      junit = result.junit;
      artifacts = result.artifacts;
      campaignVideo =
        result.artifacts.find((artifact) => artifact.flow === null && artifact.buffer.length > 0) ??
        null;
      if (result.error !== null) transportError = result.error;
      if (result.status !== 'done') {
        if (result.stdout !== '') console.log(result.stdout);
        if (result.stderr !== '') console.error(result.stderr);
      }
    } else {
      if (cfg.recordVideo) device.startVideo(spec);
      const result = device.maestro(cfg.tags, cfg.flowsDir, junitPath, outputDir);
      if (cfg.recordVideo) campaignVideo = device.stopVideo(spec);
      if (result.status !== 0) {
        if (result.stdout !== '') console.log(result.stdout);
        if (result.stderr !== '') console.error(result.stderr);
      }
      artifacts = result.artifacts;
      junit = fs.existsSync(junitPath) ? fs.readFileSync(junitPath, 'utf8') : '';
    }
  } catch (error) {
    const known = error instanceof AgentTimeoutError || error instanceof AgentProtocolError;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✖ ${known ? message : `campagne interrompue : ${message}`}`);
    transportError = message;
  }

  // Le rapport JUnit est écrit tel que Maestro l'a produit (ADR-3015 § 3).
  if (junit !== '') fs.writeFileSync(junitPath, junit);
  const problem = junitProblem(junit);
  const cases = parseJunit(junit);

  // Artefacts : un répertoire par flux, jamais de repli sur le premier flux (ADR-3015 § 2).
  const flowArtifacts = artifacts.filter((artifact) => artifact.flow !== null);
  const { byFlow, unattributed } = attributeArtifacts({
    artifacts: flowArtifacts,
    flows: selected,
  });
  const written = new Map();
  for (const flow of selected) {
    const dir = path.join(outDir, 'artifacts', flowSlug(flow.name));
    const own = new Set();
    const screenshots = [];
    const videos = [];
    const write = (artifact, bucket) => {
      fs.mkdirSync(dir, { recursive: true });
      let name = path.basename(artifact.name);
      let target = path.join(dir, name);
      if (own.has(target)) {
        name = `${String(bucket.length + 1).padStart(2, '0')}-${name}`;
        target = path.join(dir, name);
      }
      own.add(target);
      fs.writeFileSync(target, artifact.buffer);
      bucket.push(target);
    };
    for (const artifact of screenshotsForFlow(byFlow, flow)) write(artifact, screenshots);
    for (const artifact of videosForFlow(byFlow, flow)) write(artifact, videos);
    written.set(flowSlug(flow.name), { screenshots, videos });
  }

  let campaignVideoPath = null;
  if (campaignVideo !== null) {
    campaignVideoPath = path.join(outDir, 'artifacts', 'campagne', 'campagne.mp4');
    fs.mkdirSync(path.dirname(campaignVideoPath), { recursive: true });
    fs.writeFileSync(campaignVideoPath, campaignVideo.buffer);
  }

  // Comparaison visuelle flux par flux (ADR-3015 § 4).
  const visualResults = [];
  const pendingComparisons = [];
  for (const flow of selected) {
    if (!flow.tags.includes('visual')) continue;
    const capture = (written.get(flowSlug(flow.name))?.screenshots ?? [])[0];
    if (capture === undefined) {
      visualResults.push({
        flow: flow.name,
        status: 'failed',
        detail: 'aucune capture rattachée à ce flux (`takeScreenshot` absent ou nommé autrement)',
      });
      continue;
    }
    const stamp = path.basename(flow.file, '.yaml');
    const baseline = path.join(BASELINES_DIR, `${stamp}.png`);
    if (!fs.existsSync(baseline)) {
      fs.mkdirSync(BASELINES_DIR, { recursive: true });
      fs.copyFileSync(capture, baseline);
      visualResults.push({
        flow: flow.name,
        status: 'baseline-created',
        detail: path.relative(ROOT, baseline),
        capture,
        baseline,
      });
      continue;
    }
    pendingComparisons.push({ flow, capture, baseline });
  }

  const compared = compareFlows(
    pendingComparisons.map((entry) => ({
      flow: entry.flow.name,
      capture: fs.readFileSync(entry.capture),
      baseline: fs.readFileSync(entry.baseline),
    })),
  );
  pendingComparisons.forEach((entry, index) => {
    const result = compared[index];
    const diffPath = path.join(
      outDir,
      'artifacts',
      flowSlug(entry.flow.name),
      `${path.basename(entry.flow.file, '.yaml')}.diff.png`,
    );
    if (result?.diffPng !== null && result?.diffPng !== undefined) {
      fs.mkdirSync(path.dirname(diffPath), { recursive: true });
      fs.writeFileSync(diffPath, PNG.sync.write(result.diffPng));
    }
    visualResults.push({
      flow: entry.flow.name,
      status: result?.status ?? 'failed',
      ...(result?.diffRatio === null || result?.diffRatio === undefined
        ? {}
        : { diffRatio: Number(result.diffRatio.toFixed(4)) }),
      capture: entry.capture,
      baseline: entry.baseline,
      ...(result?.diffPng === null || result?.diffPng === undefined ? {} : { diff: diffPath }),
    });
  });

  const visualPassed = visualResults.filter((entry) => entry.status === 'passed').length;

  const flowReports = selected.map((flow) => {
    const slug = flowSlug(flow.name);
    const testcase = cases.find((entry) => entry.name === flow.name);
    const files = written.get(slug) ?? { screenshots: [], videos: [] };
    return {
      file: path.relative(ROOT, path.join(cfg.flowsDir, flow.file)),
      name: flow.name,
      tags: flow.tags,
      status: testcase?.status ?? 'missing',
      durationSec: testcase?.time ?? 0,
      message: testcase?.message ?? null,
      videos: files.videos.map((file) => path.relative(outDir, file)),
      screenshots: files.screenshots.map((file) => path.relative(outDir, file)),
      visual: visualResults.find((entry) => entry.flow === flow.name) ?? null,
    };
  });

  const passed = flowReports.filter((flow) => flow.status === 'passed').length;
  const videos =
    flowReports.reduce((total, flow) => total + flow.videos.length, 0) +
    (campaignVideoPath === null ? 0 : 1);
  const report = {
    spec,
    platform: cfg.platform,
    transport: cfg.deviceAgentUrl === null ? 'local' : 'agent',
    jobId,
    device: device.info(),
    tags: cfg.tags,
    startedAt,
    finishedAt: new Date().toISOString(),
    passed,
    failed: flowReports.length - passed,
    videos,
    campaignVideo: campaignVideoPath === null ? null : path.relative(outDir, campaignVideoPath),
    visual: visualPassed,
    junitCases: cases.length,
    flows: flowReports,
    visualChecks: visualResults.map((entry) => ({
      flow: entry.flow,
      status: entry.status,
      ...(entry.diffRatio === undefined ? {} : { diffRatio: entry.diffRatio }),
      ...(entry.detail === undefined ? {} : { detail: entry.detail }),
    })),
    unattributed: unattributed.map((entry) => ({
      name: entry.artifact.name,
      path: entry.artifact.path ?? null,
      reason: entry.reason,
    })),
  };

  fs.writeFileSync(path.join(outDir, 'e2e-mobile.json'), `${JSON.stringify(report, null, 2)}\n`);

  if (problem !== null) {
    console.error(`✖ campagne ${spec} non prouvée : ${problem} (ADR-3015 § 3)`);
    if (transportError !== null) console.error(`  transport : ${transportError}`);
    return 1;
  }
  if (transportError !== null && passed === 0) {
    console.error(`✖ campagne ${spec} interrompue : ${transportError}`);
    return 1;
  }
  console.log(
    `✔ campagne ${spec} : ${String(passed)} flux réussi(s), ${String(report.failed)} échec(s), ` +
      `${String(videos)} vidéo(s), ${String(visualPassed)} comparaison(s) visuelle(s)`,
  );
  console.log(`  rapport : ${path.relative(ROOT, path.join(outDir, 'e2e-mobile.json'))}`);
  if (unattributed.length > 0) {
    console.log(
      `  ${String(unattributed.length)} artefact(s) non rattaché(s) à un flux (voir le rapport)`,
    );
  }
  return passed > 0 && report.failed === 0 ? 0 : 1;
}

process.exitCode = await main();
