import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import nextConfig from '../../next.config';

const FONTS = fs.readFileSync(
  path.join(fileURLToPath(new URL('../..', import.meta.url)), 'lib', 'fonts.ts'),
  'utf8',
);

describe('[SPEC-804] configuration de performance', () => {
  it('sert les images en AVIF et WebP', () => {
    expect(nextConfig.images?.formats).toEqual(['image/avif', 'image/webp']);
  });

  it('optimise les imports des icônes et des dates', () => {
    expect(nextConfig.experimental?.optimizePackageImports).toEqual(
      expect.arrayContaining(['lucide-react', 'date-fns']),
    );
  });

  it('limite les polices aux poids des jetons avec ajustement du repli', () => {
    expect(FONTS).toContain("subsets: ['latin']");
    expect(FONTS).toContain("weight: ['400', '600', '700']");
    expect(FONTS).toContain("weight: ['600']");
    expect(FONTS).toContain("display: 'swap'");
    expect(FONTS).toContain('adjustFontFallback: true');
  });
});
