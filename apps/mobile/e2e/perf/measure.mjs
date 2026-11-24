#!/usr/bin/env node
// Mesures de performance mobile (SPEC-3502 ET-1, BR-PLA-07 ; ADR-0041).
//
// Usage : node apps/mobile/e2e/perf/measure.mjs [--apk <chemin>] [--json]
//
// Quatre budgets, mesurés sur l'émulateur Android local (ADR-3018) avec l'APK e2e installé, la
// session de démonstration ouverte et le cache persistant chaud :
//   1. démarrage à froid jusqu'à Aujourd'hui : 10 × `am start -W` après `am force-stop`, p75 < 2,5 s
//   2. réponse à un appui : `dumpsys gfxinfo framestats`, latence entrée → image terminée, p90 < 100 ms
//   3. défilement : `dumpsys gfxinfo` après une séquence de balayages, images perdues ≤ 1 %
//   4. taille de téléchargement : APK/AAB produits par Gradle, < 40 Mo par plateforme
//
// Les valeurs brutes sont imprimées en JSON (`--json`) : `evidence/SPEC-3502/perf.md` les recopie
// telles quelles, avec l'appareil et l'état du cache.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(HERE, '..', '..');
const ROOT = path.resolve(APP_DIR, '..', '..');
const PACKAGE = 'fr.learny.app';
const ACTIVITY = `${PACKAGE}/.MainActivity`;
const APK = path.join(APP_DIR, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const AAB = path.join(APP_DIR, 'android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');

const adbPath = (() => {
  const sdk = process.env.ANDROID_SDK_ROOT ?? '/opt/android-sdk';
  const candidate = path.join(sdk, 'platform-tools', 'adb');
  return fs.existsSync(candidate) ? candidate : 'adb';
})();

function adb(args, options = {}) {
  const result = spawnSync(adbPath, args, { encoding: 'utf8', timeout: 180_000, ...options });
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

function sleep(ms) {
  spawnSync('sleep', [String(ms / 1000)]);
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[Math.max(0, index)];
}

// 1. Démarrage à froid ------------------------------------------------------
const coldStarts = [];
for (let i = 0; i < 10; i += 1) {
  adb(['shell', 'am', 'force-stop', PACKAGE]);
  sleep(600);
  const output = adb(['shell', 'am', 'start', '-W', '-n', ACTIVITY]);
  const match = /TotalTime:\s*(\d+)/u.exec(output);
  if (match === null) throw new Error(`am start -W : TotalTime absent\n${output}`);
  coldStarts.push(Number(match[1]));
  sleep(400);
}
// L'écran Aujourd'hui est-il réellement affiché après un démarrage à froid ? (preuve du libellé)
adb(['shell', 'am', 'force-stop', PACKAGE]);
sleep(600);
adb(['shell', 'am', 'start', '-W', '-n', ACTIVITY]);
sleep(2500);
const dump = adb(['shell', 'uiautomator', 'dump', '/sdcard/window.xml']);
const xml = adb(['shell', 'cat', '/sdcard/window.xml']);
const todayVisible = /Aujourd/u.test(xml) || /today-screen/u.test(xml);

// Garde : les mesures d'appui et de défilement exigent l'écran Aujourd'hui au premier plan.
// `--skip-guard` sert quand l'appelant vient de vérifier l'écran (le dump uiautomator est alors
// inutile et coûteux) ; sans lui, le script relance l'application et attend Aujourd'hui.
const skipGuard = process.argv.includes('--skip-guard');
if (!skipGuard) {
adb(['shell', 'am', 'force-stop', PACKAGE]);
sleep(500);
adb(['shell', 'am', 'start', '-W', '-n', ACTIVITY]);
sleep(2500);
let onToday = false;
for (let attempt = 0; attempt < 15 && !onToday; attempt += 1) {
  adb(['shell', 'uiautomator', 'dump', '/sdcard/ready.xml']);
  const ready = adb(['shell', 'cat', '/sdcard/ready.xml']);
  onToday = /Aujourd/u.test(ready);
  if (!onToday) sleep(1000);
}
if (!onToday) {
  console.error("✖ l'écran Aujourd'hui n'est pas affiché : mesures d'appui et de défilement annulées.");
  process.exit(3);
}
}
if (process.argv.includes('--guard-only')) process.exit(0);

// 2. Réponse à un appui -----------------------------------------------------
adb(['shell', 'dumpsys', 'gfxinfo', PACKAGE, 'reset']);
// Appuis sur la barre d'onglets native : Aujourd'hui (108) puis Programme (324), quatre fois.
for (let i = 0; i < 4; i += 1) {
  adb(['shell', 'input', 'tap', '108', '2280']);
  sleep(700);
  adb(['shell', 'input', 'tap', '324', '2280']);
  sleep(700);
}
adb(['shell', 'input', 'tap', '108', '2280']);
sleep(1200);
const frameStats = adb(['shell', 'dumpsys', 'gfxinfo', PACKAGE, 'framestats']);
const latencies = [];
const rows = frameStats.split('\n').filter((line) => /^\d+,/u.test(line.trim()));
for (const row of rows) {
  const cells = row.trim().split(',').map((cell) => Number(cell.trim()));
  // Colonnes de gfxinfo framestats : 0 FLAGS, 1 INTENDED_VSYNC, 2 VSYNC, 3 OLDEST_INPUT_EVENT,
  // 4 NEWEST_INPUT_EVENT, 5 HANDLE_INPUT_START, 13 FRAME_COMPLETED.
  const oldestInput = cells[3];
  const completed = cells[13];
  if (Number.isFinite(oldestInput) && Number.isFinite(completed) && oldestInput > 0 && completed > oldestInput) {
    latencies.push((completed - oldestInput) / 1e6);
  }
}

// 3. Défilement -------------------------------------------------------------
adb(['shell', 'dumpsys', 'gfxinfo', PACKAGE, 'reset']);
for (let i = 0; i < 6; i += 1) {
  adb(['shell', 'input', 'swipe', '540', '1900', '540', '700', '250']);
  sleep(400);
}
for (let i = 0; i < 6; i += 1) {
  adb(['shell', 'input', 'swipe', '540', '700', '540', '1900', '250']);
  sleep(400);
}
const scrollStats = adb(['shell', 'dumpsys', 'gfxinfo', PACKAGE]);
const janky = /Janky frames:\s*(\d+)\s*\(([\d.]+)%\)/u.exec(scrollStats);
const totalFrames = /Total frames rendered:\s*(\d+)/u.exec(scrollStats);
const frameTime = /90th percentile:\s*(\d+)ms/u.exec(scrollStats);

// 4. Taille de téléchargement ----------------------------------------------
const sizeMB = (file) =>
  fs.existsSync(file) ? Number((fs.statSync(file).size / 1024 ** 2).toFixed(1)) : null;

const result = {
  measuredAt: new Date().toISOString(),
  device: {
    model: adb(['shell', 'getprop', 'ro.product.model']).trim(),
    api: adb(['shell', 'getprop', 'ro.build.version.sdk']).trim(),
    abi: adb(['shell', 'getprop', 'ro.product.cpu.abi']).trim(),
    resolution: adb(['shell', 'wm', 'size']).trim(),
  },
  coldStart: {
    samples: coldStarts,
    p75: percentile(coldStarts, 0.75),
    max: Math.max(...coldStarts),
    todayVisible,
    adbDump: dump.trim().split('\n').pop() ?? '',
  },
  tapResponse: {
    samplesMs: latencies.map((value) => Number(value.toFixed(1))),
    count: latencies.length,
    p90: latencies.length === 0 ? null : Number(percentile(latencies, 0.9).toFixed(1)),
    max: latencies.length === 0 ? null : Number(Math.max(...latencies).toFixed(1)),
  },
  scroll: {
    jankyFrames: janky === null ? null : Number(janky[1]),
    jankyPercent: janky === null ? null : Number(janky[2]),
    totalFrames: totalFrames === null ? null : Number(totalFrames[1]),
    frameTime90: frameTime === null ? null : Number(frameTime[1]),
  },
  download: {
    apkMB: sizeMB(APK),
    aabMB: sizeMB(AAB),
  },
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`appareil : ${result.device.model} API ${result.device.api} (${result.device.resolution})`);
  console.log(`démarrage à froid : ${coldStarts.join(', ')} ms → p75 ${String(result.coldStart.p75)} ms`);
  console.log(`Aujourd'hui affiché après démarrage : ${todayVisible ? 'oui' : 'non'}`);
  console.log(`réponse à un appui : p90 ${String(result.tapResponse.p90)} ms (${latencies.length} trames)`);
  console.log(`défilement : ${String(result.scroll.jankyPercent)} % d'images perdues sur ${String(result.scroll.totalFrames)} trames`);
  console.log(`téléchargement : APK ${String(result.download.apkMB)} Mo, AAB ${String(result.download.aabMB)} Mo`);
}
void ROOT;
