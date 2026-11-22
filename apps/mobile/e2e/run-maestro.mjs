#!/usr/bin/env node
// Maestro runner of the mobile track (SPEC-3001 EF-5, CL-3, CL-4).
//
// Usage (through `pnpm test:e2e:mobile`):
//   node apps/mobile/e2e/run-maestro.mjs --tags SPEC-3001 [--platform android] [--apk <path>]
//                                        [--flows <dir>] [--out <dir>] [--record-video]
//
// Steps: check (or start) the emulator, install the `e2e` build, freeze the status bar (canevas
// § 5), run `maestro test --include-tags` in JUnit mode, copy the videos and screenshots, run the
// visual comparison of the flows tagged `visual` against `e2e/visual/baselines/`, then write
// `test-results/sdd/<SPEC>/e2e-mobile.json` = `{ passed, failed, videos, visual, flows[] }`.
//
// Two transports, same contract:
//   - local (default): `adb` and `maestro` are on this machine;
//   - remote: `MOBILE_DEVICE_AGENT_URL` points at `e2e/device-agent.mjs` running on the machine
//     that owns the emulator (the dual-VM setup of this project, ADR-3012). The APK is pulled by
//     the agent from `MOBILE_APK_URL`, a signed URL of the development machine.
//
// Exit codes: 0 campaign passed, 1 campaign failed, 2 misuse or no emulator (CL-4).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

import { compareImages } from './visual/compare.mjs';

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
    avd: env.MOBILE_AVD ?? 'agent37',
    recordVideo: flags['record-video'] !== undefined || env.MOBILE_RECORD_VIDEO === '1',
    outDir: null,
    tagsWanted: tags,
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

/** Reads `name:` and `tags:` of a Maestro flow without a YAML dependency. */
export function parseFlowHeader(content) {
  const lines = content.split('\n');
  const nameLine = lines.find((line) => line.startsWith('name:'));
  const name = nameLine === undefined ? '' : nameLine.slice('name:'.length).trim();
  const tags = [];
  let inTags = false;
  for (const line of lines) {
    // The YAML document separator closes the header (`---`).
    if (line.trim() === '---') {
      inTags = false;
      continue;
    }
    if (/^tags:\s*$/.test(line)) {
      inTags = true;
      continue;
    }
    if (inTags) {
      const match = /^\s*-\s*(.+?)\s*$/.exec(line);
      const tag = match?.[1]?.replace(/^["']|["']$/g, '') ?? '';
      // Only real labels: the document separator and comments are not tags.
      if (tag !== '' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(tag)) {
        tags.push(tag);
        continue;
      }
      inTags = false;
    }
  }
  const appIdLine = lines.find((line) => line.startsWith('appId:'));
  return {
    name,
    tags,
    appId: appIdLine === undefined ? '' : appIdLine.slice('appId:'.length).trim(),
    content,
  };
}

function readFlows(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
    .sort()
    .map((file) => ({ file, ...parseFlowHeader(fs.readFileSync(path.join(dir, file), 'utf8')) }));
}

/** Minimal JUnit reader: test cases and their failures. */
export function parseJunit(xml) {
  const cases = [];
  const blocks = xml.split(/<testcase\b/).slice(1);
  for (const block of blocks) {
    const head = block.split('>')[0] ?? '';
    const name = /name="([^"]*)"/.exec(head)?.[1] ?? '';
    const time = Number(/time="([^"]*)"/.exec(head)?.[1] ?? '0');
    const body = block.split('</testcase>')[0] ?? '';
    const failed = /<failure\b/.test(body) || /<error\b/.test(body);
    const skipped = /<skipped\b/.test(body);
    cases.push({
      name,
      time,
      status: failed ? 'failed' : skipped ? 'skipped' : 'passed',
      message: /message="([^"]*)"/.exec(body)?.[1] ?? null,
    });
  }
  return cases;
}

// ---------------------------------------------------------------------------------------------
// Transports.

/** Runs adb and maestro on this machine. */
class LocalDevice {
  constructor(cfg) {
    this.cfg = cfg;
    this.adb = process.env.ADB ?? 'adb';
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

  maestro(tags, flowsDir, output) {
    const binary = process.env.MAESTRO ?? path.join(os.homedir(), '.maestro', 'bin', 'maestro');
    const command = fs.existsSync(binary) ? binary : 'maestro';
    return run(
      command,
      ['test', '--include-tags', tags.join(','), '--format', 'junit', '--output', output, flowsDir],
      { timeout: 900_000, env: { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1' } },
    );
  }

  artifacts(names) {
    // Maestro keeps its screenshots and recordings under ~/.maestro/tests/<date>/.
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
    const wanted = names.map((name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    return files
      .filter((file) => {
        const base = path
          .basename(file)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-');
        return wanted.some((name) => base.includes(name));
      })
      .slice(0, 20)
      .map((file) => ({ name: path.basename(file), buffer: fs.readFileSync(file) }));
  }

  screenshot(name) {
    const result = spawnSync(this.adb, ['exec-out', 'screencap', '-p'], {
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.status !== 0 || !result.stdout || result.stdout.length === 0) return null;
    return { name: `${name}.png`, buffer: result.stdout };
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
    if (pull.status !== 0 || !fs.existsSync(local)) return [];
    const buffer = fs.readFileSync(local);
    fs.rmSync(local, { force: true });
    return [{ name: `${name}.mp4`, buffer }];
  }
}

/** Runs the same steps on the machine that owns the emulator (ADR-3012). */
class RemoteDevice {
  constructor(cfg) {
    this.cfg = cfg;
    this.info_ = { platform: cfg.platform };
  }

  async call(route, body) {
    const response = await fetch(`${this.cfg.deviceAgentUrl.replace(/\/+$/, '')}${route}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.cfg.deviceAgentToken === null
          ? {}
          : { 'x-device-token': this.cfg.deviceAgentToken }),
      },
      body: JSON.stringify(body ?? {}),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? `agent HTTP ${String(response.status)}`);
    return payload;
  }

  async ensure() {
    const result = await this.call('/device');
    this.info_ = result.device ?? this.info_;
    return { ok: result.ok === true, detail: result.detail ?? '' };
  }

  info() {
    return this.info_;
  }

  async install() {
    const result = await this.call('/install', { apkUrl: this.cfg.apkUrl });
    return { ok: result.ok === true, detail: result.detail ?? '' };
  }

  async freeze() {
    const result = await this.call('/freeze');
    return { ok: result.ok === true, detail: result.detail ?? '' };
  }

  async maestro(tags, flows, recordVideo) {
    const result = await this.call('/maestro', {
      tags,
      recordVideo,
      flows: flows.map((flow) => ({ file: flow.file, content: flow.content })),
    });
    return {
      status: result.status ?? 1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      junit: result.junit ?? '',
      artifacts: (result.artifacts ?? []).map((artifact) => ({
        name: artifact.name,
        buffer: Buffer.from(artifact.base64, 'base64'),
      })),
    };
  }

  startVideo() {
    return { ok: true, detail: 'vidéo enregistrée par l’agent' };
  }

  stopVideo() {
    return [];
  }
}

// ---------------------------------------------------------------------------------------------
// Campaign.

function writeArtifacts(dir, artifacts) {
  fs.mkdirSync(dir, { recursive: true });
  const written = [];
  for (const artifact of artifacts) {
    const target = path.join(dir, artifact.name);
    fs.writeFileSync(target, artifact.buffer);
    written.push(target);
  }
  return written;
}

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
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, 'artifacts'), { recursive: true });

  const device = cfg.deviceAgentUrl === null ? new LocalDevice(cfg) : new RemoteDevice(cfg);

  const ready = await device.ensure();
  if (!ready.ok) {
    console.error(`✖ émulateur indisponible : ${ready.detail} (CL-4)`);
    return 2;
  }
  console.log(`✔ émulateur : ${JSON.stringify(device.info())}`);

  if (cfg.deviceAgentUrl === null) {
    const installed = await device.install(cfg.apk);
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
  const startedAt = new Date().toISOString();
  let junit;
  let artifacts = [];

  if (device instanceof RemoteDevice) {
    const result = await device.maestro(cfg.tags, selected, cfg.recordVideo);
    junit = result.junit;
    artifacts = result.artifacts;
    fs.writeFileSync(junitPath, junit);
    if (result.status !== 0) {
      console.log(result.stdout);
      console.error(result.stderr);
    }
  } else {
    device.startVideo(spec);
    const result = device.maestro(cfg.tags, cfg.flowsDir, junitPath);
    const video = device.stopVideo(spec);
    if (result.status !== 0) {
      console.log(result.stdout);
      console.error(result.stderr);
    }
    const screenshots = selected
      .map((flow) => device.screenshot(path.basename(flow.file, '.yaml')))
      .filter((shot) => shot !== null);
    artifacts = [...video, ...screenshots];
    junit = fs.existsSync(junitPath) ? fs.readFileSync(junitPath, 'utf8') : '';
  }

  const cases = parseJunit(junit);

  // Artifacts: one directory per flow, keyed by the flow name (one file per name, the transport
  // may return the same screenshot twice).
  const artifactIndex = {};
  const seen = new Set();
  for (const artifact of artifacts) {
    if (seen.has(artifact.name)) continue;
    seen.add(artifact.name);
    const owner =
      selected.find((flow) =>
        artifact.name.toLowerCase().includes(path.basename(flow.file, '.yaml').toLowerCase()),
      ) ?? selected[0];
    const dir = path.join(outDir, 'artifacts', path.basename(owner.file, '.yaml'));
    const [written] = writeArtifacts(dir, [artifact]);
    artifactIndex[path.basename(owner.file, '.yaml')] ??= { screenshots: [], videos: [] };
    if (artifact.name.endsWith('.mp4'))
      artifactIndex[path.basename(owner.file, '.yaml')].videos.push(written);
    else artifactIndex[path.basename(owner.file, '.yaml')].screenshots.push(written);
  }

  // Visual comparison of the flows tagged `visual` (EF-6, ADR-3003 § 4).
  let visualPassed = 0;
  const visualResults = [];
  for (const flow of selected) {
    if (!flow.tags.includes('visual')) continue;
    const base = path.basename(flow.file, '.yaml');
    const capture = (artifactIndex[base]?.screenshots ?? []).find((file) => /\.png$/.test(file));
    if (capture === undefined) {
      visualResults.push({ flow: flow.name, status: 'failed', detail: 'aucune capture' });
      continue;
    }
    const baseline = path.join(BASELINES_DIR, `${base}.png`);
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
    const result = compareImages(fs.readFileSync(capture), fs.readFileSync(baseline));
    const diffPath = path.join(outDir, 'artifacts', base, `${base}.diff.png`);
    fs.writeFileSync(diffPath, PNG.sync.write(result.diffPng));
    visualResults.push({
      flow: flow.name,
      status: result.ok ? 'passed' : 'failed',
      diffRatio: Number(result.diffRatio.toFixed(4)),
      capture,
      baseline,
      diff: diffPath,
    });
    if (result.ok) visualPassed += 1;
  }

  const flowReports = selected.map((flow) => {
    const testcase = cases.find((entry) => entry.name === flow.name);
    const base = path.basename(flow.file, '.yaml');
    return {
      file: path.relative(ROOT, path.join(cfg.flowsDir, flow.file)),
      name: flow.name,
      tags: flow.tags,
      status: testcase?.status ?? 'missing',
      durationSec: testcase?.time ?? 0,
      message: testcase?.message ?? null,
      videos: (artifactIndex[base]?.videos ?? []).map((file) => path.relative(outDir, file)),
      screenshots: (artifactIndex[base]?.screenshots ?? []).map((file) =>
        path.relative(outDir, file),
      ),
      visual: visualResults.find((entry) => entry.flow === flow.name) ?? null,
    };
  });

  const passed = flowReports.filter((flow) => flow.status === 'passed').length;
  const videos = flowReports.reduce((total, flow) => total + flow.videos.length, 0);
  const report = {
    spec,
    platform: cfg.platform,
    transport: cfg.deviceAgentUrl === null ? 'local' : 'agent',
    device: device.info(),
    tags: cfg.tags,
    startedAt,
    finishedAt: new Date().toISOString(),
    passed,
    failed: flowReports.length - passed,
    videos,
    visual: visualPassed,
    flows: flowReports,
    visualChecks: visualResults.map((entry) => ({
      flow: entry.flow,
      status: entry.status,
      ...(entry.diffRatio === undefined ? {} : { diffRatio: entry.diffRatio }),
      ...(entry.detail === undefined ? {} : { detail: entry.detail }),
    })),
  };

  fs.writeFileSync(path.join(outDir, 'e2e-mobile.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `✔ campagne ${spec} : ${String(passed)} flux réussi(s), ${String(report.failed)} échec(s), ` +
      `${String(videos)} vidéo(s), ${String(visualPassed)} comparaison(s) visuelle(s)`,
  );
  console.log(`  rapport : ${path.relative(ROOT, path.join(outDir, 'e2e-mobile.json'))}`);
  return passed > 0 && report.failed === 0 ? 0 : 1;
}

process.exitCode = await main();
