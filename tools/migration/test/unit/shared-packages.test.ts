// SPEC-1002 §12, ET-3/CA-1 — portabilité des paquets partagés (ADR-1007) : esbuild construit
// l'entrée de chaque paquet pour la plateforme « neutral » (exécutable navigateur, Node et
// React Native) ; l'échec de la construction, un module node:* ou un paquet serveur dans le
// méta-fichier fait échouer le test. Aucune écriture dans le dépôt : le cas négatif (CA-1)
// construit un arbre éphémère dans le répertoire temporaire du système, qui importe la vraie
// entrée de @learny/domain.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, type Metafile } from 'esbuild';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

const SHARED_PACKAGES = [
  { name: '@learny/contracts', entry: 'packages/contracts/src/index.ts' },
  { name: '@learny/core (entrée .)', entry: 'packages/core/src/index.ts' },
  { name: '@learny/api-client', entry: 'packages/api-client/src/index.ts' },
  { name: '@learny/domain', entry: 'packages/domain/src/index.ts' },
  { name: '@learny/i18n', entry: 'packages/i18n/src/index.ts' },
  { name: '@learny/learning-engine', entry: 'packages/learning-engine/src/index.ts' },
] as const;

// ET-3 : les trois dépendances externes tolérées ; tout le reste est bundlé, donc vérifié.
const EXTERNAL = ['zod', 'ts-fsrs', '@date-fns/tz'];
const SERVER_PACKAGE =
  /(^|\/)packages\/(db|services|jobs|llm|tutor|ingestion|automations|notifications|http|api-routes)\//;

/** Violations de portabilité d'une entrée : échec de build, module node:*, paquet serveur. */
async function portabilityViolations(entry: string): Promise<string[]> {
  let metafile: Metafile;
  try {
    const result = await build({
      entryPoints: [entry],
      platform: 'neutral',
      bundle: true,
      write: false,
      metafile: true,
      format: 'esm',
      external: EXTERNAL,
      logLevel: 'silent',
    });
    metafile = result.metafile;
  } catch (error) {
    return [
      `construction échouée : ${
        error instanceof Error ? (error.message.split('\n')[0] ?? error.message) : String(error)
      }`,
    ];
  }
  const violations: string[] = [];
  for (const input of Object.keys(metafile.inputs)) {
    const module = input.replaceAll('\\', '/');
    if (/^node:/.test(module)) violations.push(`module node : ${module}`);
    if (SERVER_PACKAGE.test(module)) violations.push(`paquet serveur : ${module}`);
  }
  return violations;
}

describe('[SPEC-1002] shared packages portability', () => {
  it.each(SHARED_PACKAGES)(
    'construit $name sans module Node ni paquet serveur (CA-1)',
    async ({ name, entry }) => {
      expect(await portabilityViolations(path.join(ROOT, entry)), name).toEqual([]);
    },
  );

  let tempDir: string | null = null;

  afterEach(() => {
    if (tempDir !== null) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('signale un module node:fs ajouté à @learny/domain (CA-1, cas négatif)', async () => {
    // Arbre éphémère hors du dépôt : la vraie entrée de domain est importée par chemin
    // relatif (même volume en dev comme en CI), un module fantôme importe node:fs. Selon la
    // plateforme, esbuild refuse « node:fs » à la construction ou le garde dans le
    // méta-fichier : dans les deux cas la violation est signalée.
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'learny-spec1002-'));
    fs.writeFileSync(
      path.join(tempDir, 'node-leak.ts'),
      "import { readFileSync } from 'node:fs';\nexport const read = readFileSync;\n",
    );
    const domainEntry = path.join(ROOT, 'packages/domain/src/index.ts');
    const relativeEntry = path
      .relative(tempDir, domainEntry)
      .replaceAll('\\', '/')
      .replace(/\.ts$/, '');
    fs.writeFileSync(
      path.join(tempDir, 'entry.ts'),
      `import * as domain from '${relativeEntry}';\nimport { read } from './node-leak';\nexport const bundle = { domain, read };\n`,
    );
    const violations = await portabilityViolations(path.join(tempDir, 'entry.ts'));
    expect(
      violations.some(
        (violation) => violation.includes('node:fs') || violation.includes('construction échouée'),
      ),
      violations.join(' ; '),
    ).toBe(true);
  });
});
