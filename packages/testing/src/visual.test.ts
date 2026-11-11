import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PNG } from 'pngjs';
import { afterAll, describe, expect, it } from 'vitest';

import { compareWithReference } from './visual';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'learny-visual-'));

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function png(width: number, height: number, paint?: (x: number, y: number) => number[]): Buffer {
  const img = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint?.(x, y) ?? [255, 255, 255];
      const i = (y * width + x) * 4;
      img.data[i] = r ?? 0;
      img.data[i + 1] = g ?? 0;
      img.data[i + 2] = b ?? 0;
      img.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(img);
}

function save(name: string, data: Buffer): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, data);
  return file;
}

describe('[SPEC-004] visual comparison', () => {
  const reference = save('reference.png', png(10, 10));

  it('reports 0 % for identical images (CL-3)', () => {
    const r = compareWithReference(png(10, 10), reference, dir, 'same');
    expect(r).toMatchObject({ width: 10, height: 10, diffPixels: 0, totalPixels: 100, ratio: 0 });
  });

  it('counts a changed pixel once and writes the diff and side-by-side images (CA-3)', () => {
    const altered = png(10, 10, (x, y) => (x === 3 && y === 4 ? [0, 0, 0] : [255, 255, 255]));
    const r = compareWithReference(altered, reference, dir, 'one-pixel');
    expect(r.diffPixels).toBe(1);
    expect(r.ratio).toBe(0.01);
    const side = PNG.sync.read(fs.readFileSync(r.sideBySidePath));
    expect([side.width, side.height]).toEqual([20, 10]);
    expect(PNG.sync.read(fs.readFileSync(r.diffPath)).width).toBe(10);
  });

  it('measures a larger alteration', () => {
    const half = png(10, 10, (x) => (x < 5 ? [0, 0, 0] : [255, 255, 255]));
    expect(compareWithReference(half, reference, dir, 'half').ratio).toBe(0.5);
  });

  it('fails on different dimensions without resizing (CL-2)', () => {
    expect(() => compareWithReference(png(12, 10), reference, dir, 'size')).toThrow(
      'Dimensions différentes : capture 12×10, référence 10×10',
    );
  });

  it('fails explicitly when the reference is missing (CL-4)', () => {
    const missing = path.join(dir, 'absent.png');
    expect(() => compareWithReference(png(10, 10), missing, dir, 'missing')).toThrow(
      `Référence absente : ${missing}`,
    );
  });
});
