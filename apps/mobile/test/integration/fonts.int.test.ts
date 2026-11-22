// Vitest (integration) — SPEC-3002 CA-1, ET-3: the six weights of § 3 are embedded and readable.
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { fontFamilies } from '../../src/theme/tokens';

const ROOT = process.cwd();
const FONTS_DIR = path.join(ROOT, 'apps/mobile/assets/fonts');

/** Files of § 3: Inter 400/500/600/700 and Space Grotesk 500/600/700. */
const FILES: Readonly<Record<keyof typeof fontFamilies, string>> = {
  body: 'Inter-Regular.ttf',
  bodyMedium: 'Inter-Medium.ttf',
  bodySemiBold: 'Inter-SemiBold.ttf',
  bodyBold: 'Inter-Bold.ttf',
  displayMedium: 'SpaceGrotesk-Medium.ttf',
  display: 'SpaceGrotesk-SemiBold.ttf',
  displayBold: 'SpaceGrotesk-Bold.ttf',
};

function isTrueType(file: string): boolean {
  const header = readFileSync(file).subarray(0, 4);
  const tag = header.toString('latin1');
  // 0x00010000, 'true' and 'OTTO' are the headers of a TrueType/OpenType font.
  return (
    (header[0] === 0 && header[1] === 1 && header[2] === 0 && header[3] === 0) ||
    tag === 'true' ||
    tag === 'OTTO'
  );
}

describe('[SPEC-3002] polices embarquées', () => {
  it('embarque les sept graisses de la spécification', () => {
    const families = Object.keys(FILES);
    expect(families.sort()).toEqual(Object.keys(fontFamilies).sort());
    for (const file of Object.values(FILES)) {
      const full = path.join(FONTS_DIR, file);
      expect(statSync(full).size, `${file} doit peser plus de 20 ko`).toBeGreaterThan(20_000);
      expect(isTrueType(full), `${file} doit être une police TrueType`).toBe(true);
    }
  });

  it('déclare chaque fichier dans la configuration Expo (ET-3)', () => {
    const config = readFileSync(path.join(ROOT, 'apps/mobile/app.config.ts'), 'utf8');
    for (const file of Object.values(FILES)) {
      expect(config).toContain(`./assets/fonts/${file}`);
    }
  });
});
