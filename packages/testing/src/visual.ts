// Visual conformity helpers (docs/engineering/testing.md §6, ADR-0034).
import fs from 'node:fs';
import path from 'node:path';

import { expect, test, type Page, type PageScreenshotOptions } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/** Structural conformity threshold against a mockup reference (≤ 12 %). */
export const MOCKUP_MAX_DIFF_RATIO = 0.12;
/** Non-regression threshold of toHaveScreenshot (≤ 1 %). */
export const BASELINE_MAX_DIFF_RATIO = 0.01;

/**
 * SDD demo tokens, aligned with @learny/ui (SPEC-301). Keeping the values here avoids a package
 * dependency from @learny/testing to @learny/ui while preserving the expectTokens API.
 */
export const PROVISIONAL_TOKENS = {
  color: {
    text: '#111113',
    border: '#E7E6E1',
    background: '#F4F4F1',
    success: '#0F9F7F',
    danger: '#B42318',
  },
  radius: { card: '16px' },
} as const;

export type TokenExpectations = Record<string, Record<string, string>>;

function hexToRgb(value: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (!m) return value;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h ?? '0', 16));
  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
}

/** Computed styles must equal the tokens; hex colours are compared in their rgb() form. */
export async function expectTokens(page: Page, selectors: TokenExpectations): Promise<void> {
  for (const [selector, styles] of Object.entries(selectors)) {
    const locator = page.locator(selector).first();
    await expect(locator, `élément ${selector}`).toBeVisible();
    for (const [property, token] of Object.entries(styles)) {
      await expect(locator, `${selector} ${property}`).toHaveCSS(property, hexToRgb(token));
    }
  }
}

export interface ComparisonResult {
  width: number;
  height: number;
  diffPixels: number;
  totalPixels: number;
  ratio: number;
  sideBySidePath: string;
  diffPath: string;
}

function readPng(source: Buffer | string): PNG {
  return PNG.sync.read(typeof source === 'string' ? fs.readFileSync(source) : source);
}

/** Crops a PNG (buffer or path) to the top-left region; used by region-level mockup comparisons. */
export function cropPng(source: Buffer | string, width: number, height: number): Buffer {
  const image = readPng(source);
  if (width > image.width || height > image.height) {
    throw new Error(
      `Recadrage impossible : ${String(width)}×${String(height)} dépasse ${String(image.width)}×${String(image.height)}`,
    );
  }
  const out = new PNG({ width, height });
  PNG.bitblt(image, out, 0, 0, width, height, 0, 0);
  return PNG.sync.write(out);
}

function sideBySide(left: PNG, right: PNG): PNG {
  const out = new PNG({ width: left.width + right.width, height: left.height });
  PNG.bitblt(left, out, 0, 0, left.width, left.height, 0, 0);
  PNG.bitblt(right, out, 0, 0, right.width, right.height, left.width, 0);
  return out;
}

/**
 * Compares a capture with its mockup reference. Never resizes: different dimensions fail,
 * as they reveal a viewport error. A missing reference fails explicitly.
 */
export function compareWithReference(
  actual: Buffer | string,
  reference: string,
  outputDir: string,
  name = 'comparison',
): ComparisonResult {
  if (!fs.existsSync(reference)) {
    throw new Error(`Référence absente : ${reference}`);
  }
  const a = readPng(actual);
  const r = readPng(reference);
  if (a.width !== r.width || a.height !== r.height) {
    throw new Error(
      `Dimensions différentes : capture ${String(a.width)}×${String(a.height)}, référence ${String(r.width)}×${String(r.height)}`,
    );
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const diffPixels = pixelmatch(r.data, a.data, diff.data, a.width, a.height, { threshold: 0.1 });
  fs.mkdirSync(outputDir, { recursive: true });
  const sideBySidePath = path.join(outputDir, `${name}-side-by-side.png`);
  const diffPath = path.join(outputDir, `${name}-diff.png`);
  fs.writeFileSync(sideBySidePath, PNG.sync.write(sideBySide(r, a)));
  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  const totalPixels = a.width * a.height;
  return {
    width: a.width,
    height: a.height,
    diffPixels,
    totalPixels,
    ratio: diffPixels / totalPixels,
    sideBySidePath,
    diffPath,
  };
}

export interface ReferenceRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Nearest-neighbour crop of the mockup region, scaled to the real capture dimensions. */
function resizeRegion(image: PNG, region: ReferenceRegion, width: number, height: number): PNG {
  if (
    region.x < 0 ||
    region.y < 0 ||
    region.width <= 0 ||
    region.height <= 0 ||
    region.x + region.width > image.width ||
    region.y + region.height > image.height
  ) {
    throw new Error(
      `Région de référence invalide : ${String(region.width)}×${String(region.height)} hors de ${String(
        image.width,
      )}×${String(image.height)}`,
    );
  }
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    const sourceY =
      region.y + Math.min(region.height - 1, Math.floor((y * region.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = region.x + Math.min(region.width - 1, Math.floor((x * region.width) / width));
      const source = (sourceY * image.width + sourceX) << 2;
      const target = (y * width + x) << 2;
      out.data[target] = image.data[source] ?? 0;
      out.data[target + 1] = image.data[source + 1] ?? 0;
      out.data[target + 2] = image.data[source + 2] ?? 0;
      out.data[target + 3] = image.data[source + 3] ?? 0;
    }
  }
  return out;
}

/**
 * Compares a real capture with a region of a mockup reference, normalised to the capture size.
 * The reference is never resized beyond the requested region: a missing file or an out-of-bounds
 * region fails explicitly, so the 12 % structural threshold is never applied to a blank crop.
 */
export function compareWithReferenceRegion(
  actual: Buffer | string,
  reference: string,
  region: ReferenceRegion,
  outputDir: string,
  name = 'comparison',
): ComparisonResult {
  if (!fs.existsSync(reference)) throw new Error(`Référence absente : ${reference}`);
  const a = readPng(actual);
  const r = readPng(reference);
  const cropped = resizeRegion(r, region, a.width, a.height);
  const diff = new PNG({ width: a.width, height: a.height });
  const diffPixels = pixelmatch(cropped.data, a.data, diff.data, a.width, a.height, {
    threshold: 0.1,
  });
  fs.mkdirSync(outputDir, { recursive: true });
  const sideBySidePath = path.join(outputDir, `${name}-side-by-side.png`);
  const diffPath = path.join(outputDir, `${name}-diff.png`);
  fs.writeFileSync(sideBySidePath, PNG.sync.write(sideBySide(cropped, a)));
  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  const totalPixels = a.width * a.height;
  return {
    width: a.width,
    height: a.height,
    diffPixels,
    totalPixels,
    ratio: diffPixels / totalPixels,
    sideBySidePath,
    diffPath,
  };
}

export type BaselineOptions = Pick<PageScreenshotOptions, 'fullPage' | 'mask'> & {
  maxDiffPixelRatio?: number;
};

/**
 * toHaveScreenshot with the CI rule of ADR-0101 §5: in CI, a baseline missing for the CI platform
 * attaches the candidate capture and annotates the test instead of failing; an existing baseline
 * that differs always fails. Locally, a missing baseline fails (create it with --update-snapshots).
 */
export async function expectScreenshotBaseline(
  page: Page,
  name: string,
  options: BaselineOptions = {},
): Promise<void> {
  const info = test.info();
  const baseline = info.snapshotPath(name, { kind: 'screenshot' });
  if (process.env.CI && !fs.existsSync(baseline)) {
    const shot: PageScreenshotOptions = {};
    if (options.fullPage !== undefined) shot.fullPage = options.fullPage;
    if (options.mask !== undefined) shot.mask = options.mask;
    await info.attach(`baseline-candidate-${name}`, {
      body: await page.screenshot(shot),
      contentType: 'image/png',
    });
    info.annotations.push({
      type: 'baseline-missing',
      description: `Ligne de base absente pour ${info.project.name} : ${path.basename(baseline)}`,
    });
    return;
  }
  await expect(page).toHaveScreenshot(name, {
    maxDiffPixelRatio: BASELINE_MAX_DIFF_RATIO,
    ...options,
  });
}

export interface ReferenceRegion {
  name: string;
  locator: import('@playwright/test').Locator;
  /** Rectangle of the same region in the reference capture, in reference pixels. */
  rect: { x: number; y: number; width: number; height: number };
}

function resizePng(source: PNG, width: number, height: number): PNG {
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(source.height - 1, Math.floor((y / height) * source.height));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(source.width - 1, Math.floor((x / width) * source.width));
      const from = (sy * source.width + sx) * 4;
      const to = (y * width + x) * 4;
      out.data[to] = source.data[from] ?? 0;
      out.data[to + 1] = source.data[from + 1] ?? 0;
      out.data[to + 2] = source.data[from + 2] ?? 0;
      out.data[to + 3] = source.data[from + 3] ?? 0;
    }
  }
  return out;
}

/**
 * ADR-0161 — compares the regions a specification owns with the same regions of the reference
 * capture. The reference crop is resized to the actual region when the 90 % scale or a scrollbar
 * makes the two captures differ by a few pixels; a structural difference stays visible in the diff.
 */
export async function compareRegions(
  page: import('@playwright/test').Page,
  options: {
    reference: string;
    regions: readonly ReferenceRegion[];
    outputDir: string;
  },
): Promise<Array<{ name: string; ratio: number; sideBySidePath: string; diffPath: string }>> {
  const reference = readPng(path.resolve(options.reference));
  fs.mkdirSync(options.outputDir, { recursive: true });
  const results: Array<{ name: string; ratio: number; sideBySidePath: string; diffPath: string }> =
    [];
  for (const region of options.regions) {
    const actual = readPng(await region.locator.screenshot({ animations: 'disabled' }));
    const { x, y, width, height } = region.rect;
    if (x + width > reference.width || y + height > reference.height) {
      throw new Error(`Région ${region.name} hors de la référence`);
    }
    const crop = new PNG({ width, height });
    PNG.bitblt(reference, crop, x, y, width, height, 0, 0);
    const resized =
      crop.width === actual.width && crop.height === actual.height
        ? crop
        : resizePng(crop, actual.width, actual.height);
    const diff = new PNG({ width: actual.width, height: actual.height });
    const diffPixels = pixelmatch(
      resized.data,
      actual.data,
      diff.data,
      actual.width,
      actual.height,
      {
        threshold: 0.1,
      },
    );
    const sideBySidePath = path.join(options.outputDir, `${region.name}-side-by-side.png`);
    const diffPath = path.join(options.outputDir, `${region.name}-diff.png`);
    fs.writeFileSync(sideBySidePath, PNG.sync.write(sideBySide(resized, actual)));
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
    results.push({
      name: region.name,
      ratio: diffPixels / (actual.width * actual.height),
      sideBySidePath,
      diffPath,
    });
  }
  return results;
}
