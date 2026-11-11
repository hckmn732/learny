#!/usr/bin/env node
/* global document, MutationObserver, getComputedStyle, requestAnimationFrame */
// Capture déterministe des maquettes en références visuelles (SPEC-005, ET-1 à ET-6).
// Usage : node tools/design/capture-references.mjs [--out <dossier>] [--only SCR-xx[/etat]] [--keep-going]
//   sans --out : génère dans un dossier temporaire, vérifie, puis publie dans design/references/.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import {
  buildManifest, buildTokens, FIXED_AT, LOCALE, manifestEntry, referenceFile, REFERENCES_DIR, SOURCES_DIR,
  sourceFile, TIME_ZONE, toJson, TOKEN_PROPERTIES, TOKEN_SELECTORS, tokenEntries, validateScenarios,
} from './manifest.mjs';
import { SCENARIOS, VIEWPORTS } from './scenarios.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FONTS = ['400 16px "Inter"', '600 16px "Inter"', '600 16px "Space Grotesk"'];
// Deterministic rasterisation: subpixel (LCD) text and hinting vary between browser launches,
// which would change a few glyph pixels and therefore the PNG hashes (EF-4, CA-2).
// GPU/compositor flags keep the raster tiles stable across launches (EF-4, CA-2).
const CHROMIUM_ARGS = [
  '--force-color-profile=srgb',
  '--font-render-hinting=none',
  '--disable-lcd-text',
  '--disable-gpu',
  '--disable-skia-runtime-opts',
  '--run-all-compositor-stages-before-draw',
  '--disable-threaded-animation',
  '--disable-threaded-scrolling',
  '--disable-checker-imaging',
  '--disable-partial-raster',
];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
// Disabled only for the capture; the sources are never edited.
const FREEZE_CSS = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
const HIDE_ID = 'learny-capture-hide';

/**
 * Keeps the document unpainted until the web fonts are ready. Otherwise Chromium may cache
 * glyph rasters drawn with the fallback face, and a later repaint does not always replace
 * them; that is what made a few captures differ between launches (EF-4, CA-2).
 */
function hideUntilFonts(context) {
  return context.addInitScript((id) => {
    const install = () => {
      if (!document.documentElement) return false;
      const style = document.createElement('style');
      style.id = id;
      style.textContent = 'html{visibility:hidden!important}';
      document.documentElement.appendChild(style);
      return true;
    };
    if (!install()) {
      const observer = new MutationObserver(() => {
        if (install()) observer.disconnect();
      });
      observer.observe(document, { childList: true, subtree: true });
    }
  }, HIDE_ID);
}

async function reveal(page) {
  await page.evaluate((id) => document.getElementById(id)?.remove(), HIDE_ID);
}

/** Serveur statique en lecture seule sur le dossier des maquettes, port aléatoire local. */
function startServer(dir) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname);
    const file = path.join(dir, path.normalize(rel));
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/**
 * Fonts are fetched once per generation by Node and served from memory to every context.
 * Replaying the exact same bytes removes the network/first-paint race that otherwise makes
 * a few glyphs rasterise with the fallback face on some launches (EF-4, CA-2). Fetching them
 * here also turns an unavailable font host into an explicit generation failure (CL-1).
 */
function fontRoutes(cache) {
  return async (route) => {
    const request = route.request();
    const url = request.url();
    let entry = cache.get(url);
    if (!entry) {
      const headers = request.headers();
      const response = await fetch(url, {
        headers: { 'user-agent': headers['user-agent'] ?? '', accept: headers.accept ?? '*/*' },
      });
      if (!response.ok) throw new Error(`Police inaccessible : ${url} (HTTP ${response.status})`);
      entry = {
        body: Buffer.from(await response.arrayBuffer()),
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      };
      cache.set(url, entry);
    }
    await route.fulfill({ status: 200, contentType: entry.contentType, body: entry.body });
  };
}

async function waitForAssets(page, label) {
  const missing = await page.evaluate(async (fonts) => {
    await document.fonts.ready;
    const out = [];
    for (const f of fonts) {
      try { await document.fonts.load(f); } catch { /* reported below */ }
      if (!document.fonts.check(f)) out.push(f);
    }
    return out;
  }, FONTS);
  if (missing.length) throw new Error(`${label} : polices non chargées (${missing.join(', ')}) — aucune police de repli n'est acceptée`);
  const broken = await page.evaluate(async () => {
    const imgs = [...document.images].filter((i) => i.getClientRects().length > 0);
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
    return imgs.filter((i) => i.naturalWidth === 0).map((i) => i.currentSrc || i.src);
  });
  if (broken.length) throw new Error(`${label} : images non chargées (${broken.join(', ')})`);
}

/**
 * Forces a full repaint after the web fonts are loaded. Some Chromium processes keep the
 * glyph rasters painted with the fallback face even once `document.fonts.ready` resolved;
 * changing the root zoom invalidates every raster and makes the capture reproducible (EF-4).
 */
async function forceRepaint(page) {
  await page.evaluate(() => {
    const root = document.documentElement;
    const zoom = Number.parseFloat(getComputedStyle(root).zoom) || 1;
    root.style.zoom = String(zoom + 0.01);
    void root.offsetHeight;
    root.style.zoom = '';
    void root.offsetHeight;
  });
}

async function collectTokens(page, scenario) {
  const raw = await page.evaluate(({ selectors, properties }) => {
    const out = [];
    for (const selector of selectors) {
      const el = [...document.querySelectorAll(selector)].find((e) => e.getClientRects().length > 0);
      if (!el) continue;
      const cs = getComputedStyle(el);
      for (const property of properties) out.push({ selector, property, value: cs.getPropertyValue(property).trim() });
    }
    return out;
  }, { selectors: TOKEN_SELECTORS, properties: TOKEN_PROPERTIES });
  return raw.map((r) => ({ ...r, screenId: scenario.screenId, source: `${SOURCES_DIR}/${sourceFile(scenario.source)}` }));
}

/**
 * Génère toutes les références dans `outDir` (manifest.json, tokens.json, PNG).
 * Lève une erreur au premier scénario non conforme ; les diagnostics vont dans `diagnosticsDir`.
 */
export async function captureReferences({
  outDir,
  sourcesDir = path.join(REPO, SOURCES_DIR),
  scenarios = SCENARIOS,
  viewports = VIEWPORTS,
  diagnosticsDir = path.join(os.tmpdir(), 'learny-references-diagnostics'),
  log = () => {},
  keepGoing = false,
} = {}) {
  const errors = validateScenarios(scenarios, viewports);
  if (errors.length) throw new Error(`Scénarios invalides :\n${errors.join('\n')}`);
  fs.mkdirSync(outDir, { recursive: true });
  const server = await startServer(path.resolve(sourcesDir));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ args: CHROMIUM_ARGS });
  const entries = [];
  const tokens = [];
  const failures = [];
  const fontCache = new Map();
  try {
    for (const scenario of scenarios) {
      for (const [viewport, size] of Object.entries(viewports)) {
        const label = `${scenario.screenId}/${scenario.state}/${viewport}`;
        // Fresh context per capture: empty storage and cookies (ET-3, CL-7).
        const context = await browser.newContext({ viewport: size, locale: LOCALE, timezoneId: TIME_ZONE, deviceScaleFactor: 1, reducedMotion: 'reduce' });
        const serveFont = fontRoutes(fontCache);
        await context.route('https://fonts.googleapis.com/**', serveFont);
        await context.route('https://fonts.gstatic.com/**', serveFont);
        await hideUntilFonts(context);
        const page = await context.newPage();
        try {
          await page.clock.setFixedTime(new Date(FIXED_AT));
          await page.goto(`${base}/${scenario.source}`, { waitUntil: 'load' });
          await page.addStyleTag({ content: FREEZE_CSS });
          // Fonts are ready before the first paint, so no fallback glyph raster is cached.
          await waitForAssets(page, label);
          await reveal(page);
          await scenario.setup(page);
          await scenario.expect(page);
          await waitForAssets(page, label);
          await forceRepaint(page);
          // Two animation frames let the final font rasterisation settle before the capture.
          await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const png = await page.screenshot({ fullPage: true, animations: 'disabled' });
          fs.writeFileSync(path.join(outDir, referenceFile(scenario.screenId, scenario.state, viewport)), png);
          entries.push(manifestEntry({ screenId: scenario.screenId, state: scenario.state, viewport, source: scenario.source, png, viewportSize: size }));
          if (viewport === 'desktop' && (scenario.state === 'base' || !scenarios.some((s) => s.screenId === scenario.screenId && s.state === 'base' && sourceFile(s.source) === sourceFile(scenario.source)))) {
            tokens.push(...(await collectTokens(page, scenario)));
          }
          log(`✔ ${label}`);
        } catch (error) {
          fs.mkdirSync(diagnosticsDir, { recursive: true });
          const diag = path.join(diagnosticsDir, `${scenario.screenId}-${scenario.state}-${viewport}-echec.png`);
          await page.screenshot({ path: diag, fullPage: true }).catch(() => {});
          const failure = new Error(`Scénario ${label} en échec : ${error.message.split('\n')[0]} (diagnostic : ${diag})`, { cause: error });
          if (!keepGoing) throw failure;
          failures.push(failure.message);
          log(`✖ ${failure.message}`);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  // Exploration mode only: a failed scenario never yields a manifest (CL-2).
  if (failures.length) throw new Error(`${failures.length} scénario(s) en échec :\n${failures.join('\n')}`);
  const manifest = buildManifest(entries);
  fs.writeFileSync(path.join(outDir, 'manifest.json'), toJson(manifest));
  fs.writeFileSync(path.join(outDir, 'tokens.json'), toJson(buildTokens(tokenEntries(tokens))));
  return manifest;
}

/** Remplace le contenu de `target` par celui de `staging` (publication en une opération, ET-4). */
export function publish(staging, target) {
  const backup = `${target}.previous-${process.pid}`;
  if (fs.existsSync(target)) fs.renameSync(target, backup);
  try {
    fs.renameSync(staging, target);
  } catch (error) {
    if (fs.existsSync(backup)) fs.renameSync(backup, target);
    throw error;
  }
  fs.rmSync(backup, { recursive: true, force: true });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
  const only = arg('--only');
  const scenarios = only ? SCENARIOS.filter((s) => `${s.screenId}/${s.state}`.startsWith(only)) : SCENARIOS;
  const explicitOut = arg('--out');
  const target = path.join(REPO, REFERENCES_DIR);
  // Staging dir next to the target so that the final rename stays on the same filesystem.
  const outDir = explicitOut ? path.resolve(explicitOut) : fs.mkdtempSync(path.join(REPO, 'design', '.references-staging-'));
  try {
    const keepGoing = process.argv.includes('--keep-going');
    const manifest = await captureReferences({ outDir, scenarios, keepGoing, log: (m) => console.log(m) });
    if (!explicitOut) {
      if (only) throw new Error('--only ne publie pas : utilisez --out pour un essai partiel.');
      const { checkReferences } = await import('./check-references.mjs');
      const staged = path.relative(REPO, outDir);
      const problems = checkReferences(REPO, staged.replace(/\\/g, '/'))
        .map((p) => p.replace(staged, REFERENCES_DIR));
      if (problems.length) throw new Error(`Contrôle avant publication en échec :\n${problems.join('\n')}`);
      publish(outDir, target);
      console.log(`✔ ${manifest.references.length} référence(s) publiées dans ${REFERENCES_DIR}/`);
    } else {
      console.log(`✔ ${manifest.references.length} référence(s) écrites dans ${outDir}`);
    }
  } catch (error) {
    if (!explicitOut) fs.rmSync(outDir, { recursive: true, force: true });
    console.error(`✖ ${error.message}`);
    process.exitCode = 1;
  }
}
