/* Exporte chaque écran en PNG (×2) avec Chrome/Edge, sans dépendance npm.
   - exports/       : appareil encadré, pour la planche et la présentation ;
   - exports/screens: écran seul 393×852 / 412×915, pour la comparaison Figma.
   Usage : node design/app-mobile/export.mjs
   Variables : CHROME_PATH (chemin de l'exécutable) */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const exportsDir = join(here, "exports");
const plainDir = join(exportsDir, "screens");
mkdirSync(plainDir, { recursive: true });

const candidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium"
].filter(Boolean);

const chrome = candidates.find((candidate) => existsSync(candidate));
if (!chrome) {
  console.error("Chrome introuvable. Définissez CHROME_PATH.");
  process.exit(1);
}

const framed = {
  ios: { w: 415, h: 874 },
  android: { w: 432, h: 935 }
};

const plain = {
  ios: { w: 393, h: 852 },
  android: { w: 412, h: 915 }
};

const screens = [
  { file: "welcome", number: "01", slug: "connexion", screen: "welcome" },
  { file: "today", number: "02", slug: "aujourdhui", screen: "today" },
  { file: "programme", number: "03", slug: "programme", screen: "programme" },
  { file: "cours", number: "04", slug: "cours", screen: "cours" },
  { file: "cours-tuteur", number: "04b", slug: "cours-tuteur", screen: "cours", sheet: true },
  { file: "quiz", number: "05", slug: "quiz", screen: "quiz" },
  { file: "session", number: "06", slug: "session", screen: "session" },
  { file: "agenda", number: "07", slug: "agenda", screen: "agenda" },
  { file: "profil", number: "08", slug: "profil", screen: "profile" }
];

const page = pathToFileURL(join(here, "view.html")).href;

function shoot({ platform, item, size, output, extra }) {
  const profile = join(tmpdir(), `learny-export-${process.pid}-${platform}-${item.file}-${extra ? "plain" : "frame"}`);
  const url = `${page}#screen=${item.screen}&platform=${platform}${item.sheet ? "&sheet=1" : ""}${extra ? "&plain=1" : ""}`;
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--run-all-compositor-stages-before-draw",
    `--user-data-dir=${profile}`,
    "--force-device-scale-factor=2",
    `--window-size=${size.w},${size.h}`,
    "--virtual-time-budget=6000",
    `--screenshot=${output}`,
    url
  ];

  const result = spawnSync(chrome, args, { stdio: "ignore", timeout: 90000 });
  rmSync(profile, { recursive: true, force: true });
  return result.status === 0 && existsSync(output);
}

for (const platform of ["ios", "android"]) {
  for (const item of screens) {
    const framedOutput = join(exportsDir, `${platform}-${item.file}.png`);
    if (shoot({ platform, item, size: framed[platform], output: framedOutput })) {
      console.log(`ok ${platform}-${item.file}.png`);
    } else {
      console.error(`Échec : ${platform} / ${item.file}`);
      process.exitCode = 1;
    }

    const plainOutput = join(plainDir, `${platform}-${item.number}-${item.slug}.png`);
    if (shoot({ platform, item, size: plain[platform], output: plainOutput, extra: true })) {
      console.log(`ok screens/${platform}-${item.number}-${item.slug}.png`);
    } else {
      console.error(`Échec : écran seul ${platform} / ${item.file}`);
      process.exitCode = 1;
    }
  }
}
