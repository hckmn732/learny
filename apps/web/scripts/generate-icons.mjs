// Generation of the application icons (SPEC-801 ET-1). The source is a vector so the four PNGs
// keep crisp edges at every density; the maskable variant keeps the logo in the central 80 %.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(HERE, '../public');
const SOURCE = path.join(PUBLIC, 'icons/source.svg');

export const ICONS = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

export async function generateIcons() {
  const svg = await readFile(SOURCE);
  for (const icon of ICONS) {
    const png = await sharp(svg).resize(icon.size, icon.size).png().toBuffer();
    await writeFile(path.join(PUBLIC, 'icons', icon.file), png);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateIcons();
  process.stdout.write('icônes générées\n');
}
