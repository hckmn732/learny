import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const WEB = fileURLToPath(new URL('../..', import.meta.url));
const NEXT_DIR = path.join(WEB, '.next');
const HEAVY_MODULES = ['NotionGraphExperience', 'TutorPanel', 'GlobalQuizSession', 'ClozeGame'];

function firstLoadChunks(): string[] {
  const manifestPath = path.join(NEXT_DIR, 'app-build-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Build absent : lancez pnpm build avant ce test (ET-6, CA-5).');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    pages?: Record<string, string[]>;
  };
  const pages = manifest.pages ?? {};
  const key = Object.keys(pages).find(
    (name) => name.includes('/accueil/page') || name === '/accueil/page',
  );
  if (key === undefined)
    throw new Error(
      `Premier chargement d’/accueil absent du manifeste (${Object.keys(pages).slice(0, 5).join(', ')})`,
    );
  return pages[key] ?? [];
}

describe('[SPEC-804] découpage du bundle', () => {
  it('ne charge pas la carte, le tuteur ni les jeux dans /accueil', () => {
    const chunks = firstLoadChunks();
    const contents = chunks
      .map((chunk) => path.join(WEB, '.next', chunk.replace(/^\/_next\//, '')))
      .filter((file) => fs.existsSync(file))
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n');
    for (const moduleName of HEAVY_MODULES) {
      expect(contents, `${moduleName} ne doit pas être dans le premier chargement`).not.toContain(
        moduleName,
      );
    }
  });
});
