import path from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const ICONS_DIR = path.resolve(__dirname, '../public/icons');

const ICONS = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

describe('[SPEC-801] icônes de l’application', () => {
  it('génère les quatre PNG aux dimensions d’EF-1 (CA-1)', async () => {
    expect(ICONS.map((icon) => icon.file)).toEqual([
      'icon-192.png',
      'icon-512.png',
      'icon-maskable-512.png',
      'apple-touch-icon.png',
    ]);
    for (const icon of ICONS) {
      const metadata = await sharp(path.join(ICONS_DIR, icon.file)).metadata();
      expect(metadata.width, icon.file).toBe(icon.size);
      expect(metadata.height, icon.file).toBe(icon.size);
      expect(metadata.format).toBe('png');
    }
  });
});
