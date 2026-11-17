import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const WEB = fileURLToPath(new URL('../..', import.meta.url));
const NEXT_DIR = path.join(WEB, '.next');
const HEAVY_MODULES = [
  'notion-graph-page',
  'tutor-panel',
  'recall-card-front',
  'categorization-game',
];

function firstLoadChunks(): string[] {
  const appManifest = path.join(NEXT_DIR, 'app-build-manifest.json');
  if (fs.existsSync(appManifest)) {
    const manifest = JSON.parse(fs.readFileSync(appManifest, 'utf8')) as {
      pages?: Record<string, string[]>;
    };
    const pages = manifest.pages ?? {};
    const key = Object.keys(pages).find((name) => name.includes('/accueil/page'));
    if (key !== undefined) return pages[key] ?? [];
  }
  // Next 16 (Turbopack) écrit un manifeste par page sous `.next/server/app/…`.
  const pageManifest = path.join(
    NEXT_DIR,
    'server',
    'app',
    '(app)',
    'accueil',
    'page',
    'build-manifest.json',
  );
  if (!fs.existsSync(pageManifest)) {
    throw new Error('Build absent : lancez pnpm build avant ce test (ET-6, CA-5).');
  }
  const manifest = JSON.parse(fs.readFileSync(pageManifest, 'utf8')) as {
    rootMainFiles?: string[];
    pagesChunkGroupBootstrapParams?: Record<string, { otherChunks?: string[] }>;
  };
  const other = manifest.pagesChunkGroupBootstrapParams?.['/(app)/accueil/page']?.otherChunks ?? [];
  return [...(manifest.rootMainFiles ?? []), ...other];
}

describe('[SPEC-804] découpage du bundle', () => {
  it('ne charge pas la carte, le tuteur ni les jeux dans /accueil', () => {
    const chunks = firstLoadChunks();
    const contents = chunks
      .map((chunk) => path.join(WEB, '.next', chunk))
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
