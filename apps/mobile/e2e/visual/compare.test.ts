// Unit tests of the visual comparison (SPEC-3001 EF-6, CA-4).
// The images are synthesised: flat colours make the expected ratio exact.
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import { compareImages, DEFAULT_THRESHOLD, parseMask, parseZones } from './compare.mjs';

const WIDTH = 100;
const HEIGHT = 200;

/** Solid image; `paint` may repaint a rectangle. */
function image(
  base: [number, number, number],
  paint?: { x: number; y: number; width: number; height: number; colour: [number, number, number] },
): Buffer {
  const png = new PNG({ width: WIDTH, height: HEIGHT });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = base[0];
    png.data[i + 1] = base[1];
    png.data[i + 2] = base[2];
    png.data[i + 3] = 255;
  }
  if (paint) {
    for (let y = paint.y; y < paint.y + paint.height; y += 1) {
      for (let x = paint.x; x < paint.x + paint.width; x += 1) {
        const index = (WIDTH * y + x) << 2;
        png.data[index] = paint.colour[0];
        png.data[index + 1] = paint.colour[1];
        png.data[index + 2] = paint.colour[2];
        png.data[index + 3] = 255;
      }
    }
  }
  return PNG.sync.write(png);
}

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

describe('[SPEC-3001] comparaison visuelle', () => {
  it('accepte une capture identique à la référence (CA-4)', () => {
    const result = compareImages(image(WHITE), image(WHITE));

    expect(result.ok).toBe(true);
    expect(result.diffRatio).toBe(0);
    expect(result.width).toBe(WIDTH);
    expect(result.height).toBe(HEIGHT);
  });

  it('échoue au-delà de 12 % de pixels différents (CA-4)', () => {
    // 30 % of the surface changes colour, well above the threshold.
    const capture = image(WHITE, {
      x: 0,
      y: 0,
      width: WIDTH,
      height: Math.round(HEIGHT * 0.3),
      colour: BLACK,
    });

    const result = compareImages(capture, image(WHITE));

    expect(result.ok).toBe(false);
    expect(result.diffRatio).toBeGreaterThan(DEFAULT_THRESHOLD);
  });

  it('réussit quand les seules différences sont dans les zones natives masquées (CA-4)', () => {
    // The status bar (top 5 %) and the navigation bar (bottom 5 %) differ: 10 % of the surface,
    // entirely masked.
    const top = image(WHITE, { x: 0, y: 0, width: WIDTH, height: 10, colour: BLACK });
    const both = image(WHITE, { x: 0, y: HEIGHT - 10, width: WIDTH, height: 10, colour: BLACK });
    // Stack the two bands into one capture.
    const capture = blend(top, both);

    const result = compareImages(capture, image(WHITE));

    expect(result.ok).toBe(true);
    expect(result.diffRatio).toBe(0);
  });

  it('compte les différences hors zones masquées même avec les bandes natives masquées', () => {
    const capture = image(WHITE, {
      x: 0,
      y: Math.round(HEIGHT / 2),
      width: WIDTH,
      height: 40,
      colour: BLACK,
    });

    const result = compareImages(capture, image(WHITE));

    expect(result.ok).toBe(false);
    expect(result.diffRatio).toBeGreaterThan(0.12);
  });

  it('redimensionne la capture aux dimensions de la référence', () => {
    const reference = image(WHITE);
    const png = PNG.sync.read(image(WHITE));
    const half = new PNG({ width: WIDTH / 2, height: HEIGHT / 2 });
    for (let y = 0; y < half.height; y += 1) {
      for (let x = 0; x < half.width; x += 1) {
        const from = (png.width * (y * 2) + x * 2) << 2;
        const to = (half.width * y + x) << 2;
        half.data[to] = png.data[from] ?? 0;
        half.data[to + 1] = png.data[from + 1] ?? 0;
        half.data[to + 2] = png.data[from + 2] ?? 0;
        half.data[to + 3] = 255;
      }
    }

    const result = compareImages(PNG.sync.write(half), reference);

    expect(result.ok).toBe(true);
    expect(result.diffRatio).toBe(0);
  });

  it('respecte un seuil explicite', () => {
    const capture = image(WHITE, { x: 0, y: 40, width: WIDTH, height: 15, colour: BLACK });
    const reference = image(WHITE);

    expect(compareImages(capture, reference, { threshold: 0.01 }).ok).toBe(false);
    expect(compareImages(capture, reference, { threshold: 0.5 }).ok).toBe(true);
  });

  it('analyse les zones masquées nommées et la liste JSON', () => {
    expect(parseMask('top=0.05,bottom=0.05', 100, 200)).toEqual([
      { x: 0, y: 0, width: 100, height: 10 },
      { x: 0, y: 190, width: 100, height: 10 },
    ]);
    expect(parseMask('[{"x":0,"y":0,"width":10,"height":10}]', 100, 200)).toEqual([
      { x: 0, y: 0, width: 10, height: 10 },
    ]);
    expect(parseMask('none', 100, 200)).toEqual([]);
    expect(() => parseMask('milieu=0.5', 100, 200)).toThrow();
    expect(parseZones('top=0.1')).toEqual({ top: 0.1 });
  });
});

/** Superimposes the non-white pixels of `over` on `under`. */
function blend(under: Buffer, over: Buffer): Buffer {
  const base = PNG.sync.read(under);
  const top = PNG.sync.read(over);
  for (let i = 0; i < base.data.length; i += 4) {
    const red = top.data[i] ?? 255;
    const green = top.data[i + 1] ?? 255;
    const blue = top.data[i + 2] ?? 255;
    if (red !== 255 || green !== 255 || blue !== 255) {
      base.data[i] = red;
      base.data[i + 1] = green;
      base.data[i + 2] = blue;
    }
  }
  return PNG.sync.write(base);
}
