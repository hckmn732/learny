#!/usr/bin/env node
// Visual comparison of a mobile capture against a reference (SPEC-3001 EF-6, ADR-3003 § 4).
//
// Usage: node apps/mobile/e2e/visual/compare.mjs <capture.png> <reference.png> [options]
//   --mask <zones>     zones masquées, « top=0.05,bottom=0.04 » (fractions de la hauteur) ou
//                      une liste JSON [{ "x": 0, "y": 0, "width": 1080, "height": 90 }]
//   --threshold <n>    écart de pixels toléré, 0.12 par défaut (12 %)
//   --color <n>        seuil de couleur de pixelmatch, 0,1 par défaut
//   --diff <file>      image de différence (défaut : <capture>.diff.png)
//   --write-baseline   écrit la référence au lieu de comparer (première génération)
//
// La capture est redimensionnée aux dimensions de la référence (plus proche voisin), les zones
// natives (barre d'état, barre d'onglets, barre de navigation) sont neutralisées dans les deux
// images, puis pixelmatch calcule l'écart. Le code de sortie est 1 au-delà du seuil.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/** Default thresholds of ADR-3003 § 4. */
export const DEFAULT_THRESHOLD = 0.12;
export const DEFAULT_COLOR_THRESHOLD = 0.1;

/**
 * Native zones hidden from the comparison, as fractions of the reference height and width.
 * The native bars are rendered by the system (ADR-3003 § 3) and differ between captures.
 */
export const DEFAULT_ZONES = { top: 0.05, bottom: 0.05, left: 0, right: 0 };

/** Colour written into the masked zones of both images (opaque black, never a theme colour). */
const MASK_COLOR = { r: 0, g: 0, b: 0, a: 255 };

/**
 * Parses the `--mask` value: named fractions (`top=0.05,bottom=0.04`) or a JSON rectangle list in
 * reference pixels. Returns rectangles in reference pixels for a `width × height` reference.
 */
export function parseMask(value, width, height) {
  if (value === undefined || value === null || value === '' || value === 'none') return [];

  const trimmed = String(value).trim();
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error('--mask : liste JSON attendue.');
    return parsed.map((rect) => ({
      x: Math.round(Number(rect.x ?? 0)),
      y: Math.round(Number(rect.y ?? 0)),
      width: Math.round(Number(rect.width ?? 0)),
      height: Math.round(Number(rect.height ?? 0)),
    }));
  }

  const zones = { ...DEFAULT_ZONES };
  for (const part of trimmed.split(',')) {
    const [name, rawValue] = part.split('=');
    const key = String(name).trim();
    const fraction = Number(rawValue);
    if (!(key in zones) || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
      throw new Error(`--mask : zone inconnue « ${part} » (top, bottom, left, right).`);
    }
    zones[key] = fraction;
  }

  const rects = [];
  if (zones.top > 0) rects.push({ x: 0, y: 0, width, height: Math.round(height * zones.top) });
  if (zones.bottom > 0) {
    const h = Math.round(height * zones.bottom);
    rects.push({ x: 0, y: height - h, width, height: h });
  }
  if (zones.left > 0) rects.push({ x: 0, y: 0, width: Math.round(width * zones.left), height });
  if (zones.right > 0) {
    const w = Math.round(width * zones.right);
    rects.push({ x: width - w, y: 0, width: w, height });
  }
  return rects;
}

/** Fills the rectangles of `png` with the mask colour. */
export function maskPng(png, rects) {
  for (const rect of rects) {
    const x0 = Math.max(0, rect.x);
    const y0 = Math.max(0, rect.y);
    const x1 = Math.min(png.width, rect.x + rect.width);
    const y1 = Math.min(png.height, rect.y + rect.height);
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const index = (png.width * y + x) << 2;
        png.data[index] = MASK_COLOR.r;
        png.data[index + 1] = MASK_COLOR.g;
        png.data[index + 2] = MASK_COLOR.b;
        png.data[index + 3] = MASK_COLOR.a;
      }
    }
  }
  return png;
}

/** Nearest-neighbour resize: the capture is scaled to the reference dimensions. */
export function resizeImage(png, width, height) {
  if (png.width === width && png.height === height) return png;
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(png.height - 1, Math.floor((y * png.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(png.width - 1, Math.floor((x * png.width) / width));
      const from = (png.width * sourceY + sourceX) << 2;
      const to = (width * y + x) << 2;
      out.data[to] = png.data[from];
      out.data[to + 1] = png.data[from + 1];
      out.data[to + 2] = png.data[from + 2];
      out.data[to + 3] = png.data[from + 3];
    }
  }
  return out;
}

/**
 * Compares two PNG buffers. Returns `{ ok, diffRatio, different, total, width, height, diffPng }`.
 * The masked zones never count as differences.
 */
export function compareImages(captureBuffer, referenceBuffer, options = {}) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const colorThreshold = options.colorThreshold ?? DEFAULT_COLOR_THRESHOLD;

  const reference = PNG.sync.read(referenceBuffer);
  const capture = resizeImage(PNG.sync.read(captureBuffer), reference.width, reference.height);

  const zones = { ...DEFAULT_ZONES, ...(options.zones ?? {}) };
  const maskSpec = options.mask ?? `top=${String(zones.top)},bottom=${String(zones.bottom)}`;
  const rects = options.masks ?? parseMask(maskSpec, reference.width, reference.height);

  maskPng(reference, rects);
  maskPng(capture, rects);

  const diff = new PNG({ width: reference.width, height: reference.height });
  const different = pixelmatch(
    reference.data,
    capture.data,
    diff.data,
    reference.width,
    reference.height,
    { threshold: colorThreshold, includeAA: false },
  );

  const total = reference.width * reference.height;
  const diffRatio = total === 0 ? 0 : different / total;

  return {
    ok: diffRatio <= threshold,
    diffRatio,
    different,
    total,
    width: reference.width,
    height: reference.height,
    threshold,
    diffPng: diff,
  };
}

/** Runs the command line; returns the exit code (0 under the threshold, 1 above, 2 on misuse). */
export function runCli(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[name] = next;
        i += 1;
      } else {
        flags[name] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  const [capturePath, referencePath] = positional;
  if (!capturePath || !referencePath) {
    console.error(
      'Usage : node compare.mjs <capture.png> <reference.png> [--mask zones] [--threshold 0.12] [--diff file]',
    );
    return 2;
  }
  if (!fs.existsSync(capturePath)) {
    console.error(`✖ capture absente : ${capturePath}`);
    return 2;
  }

  const captureBuffer = fs.readFileSync(capturePath);

  if (flags['write-baseline'] === true) {
    fs.mkdirSync(path.dirname(referencePath), { recursive: true });
    fs.writeFileSync(referencePath, captureBuffer);
    console.log(`✔ référence écrite : ${referencePath}`);
    return 0;
  }

  if (!fs.existsSync(referencePath)) {
    console.error(`✖ référence absente : ${referencePath} (générer avec --write-baseline)`);
    return 2;
  }

  const result = compareImages(captureBuffer, fs.readFileSync(referencePath), {
    ...(flags.mask === undefined ? {} : { mask: flags.mask }),
    ...(flags.zones === undefined ? {} : { zones: parseZones(flags.zones) }),
    ...(flags.threshold === undefined ? {} : { threshold: Number(flags.threshold) }),
    ...(flags.color === undefined ? {} : { colorThreshold: Number(flags.color) }),
  });

  const diffPath = typeof flags.diff === 'string' ? flags.diff : `${capturePath}.diff.png`;
  fs.mkdirSync(path.dirname(diffPath), { recursive: true });
  fs.writeFileSync(diffPath, PNG.sync.write(result.diffPng));

  const percent = (result.diffRatio * 100).toFixed(2);
  console.log(
    `${result.ok ? '✔' : '✖'} écart ${percent} % (seuil ${(result.threshold * 100).toFixed(0)} %), ` +
      `${result.width}×${result.height}, différence : ${diffPath}`,
  );
  return result.ok ? 0 : 1;
}

/** Parses `--zones top=0.06,bottom=0.04`. */
export function parseZones(value) {
  const zones = {};
  for (const part of String(value).split(',')) {
    const [name, rawValue] = part.split('=');
    const key = String(name).trim();
    const fraction = Number(rawValue);
    if (!['top', 'bottom', 'left', 'right'].includes(key) || !Number.isFinite(fraction)) {
      throw new Error(`--zones : zone inconnue « ${part} ».`);
    }
    zones[key] = fraction;
  }
  return zones;
}

const invokedDirectly =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    process.exit(runCli(process.argv.slice(2)));
  } catch (error) {
    console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}
