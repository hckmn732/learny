// SPEC-1001 §12 — frontière client/serveur de apps/web : la liste de référence ne peut que
// diminuer (EF-5) et le rapport de couplage (EF-6) reflète exactement l'état du dépôt.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ROOT,
  baselineErrors,
  baselineFrom,
  categorizeWebFile,
  importsServerPackage,
  measureWebBoundary,
  progressFrom,
} from '../../report.mjs';

const FIXTURE_FILES = {
  'apps/web/lib/encore-couple.ts': "import { userDb } from '@learny/db';\nexport const x = 1;\n",
  'apps/web/lib/decouple.ts': "import { userDb } from '@learny/db';\nexport const y = 1;\n",
  'packages/contracts/src/routes.ts':
    "import { demoRoutes } from './demo';\nexport const ROUTES = { ...demoRoutes } as const;\n",
  'packages/contracts/src/demo.ts':
    "import { defineRoute } from './define-route';\nexport const demoRoutes = { demo: defineRoute({ id: 'demo.get' }) } as const;\n",
};

let tempRoot: string | null = null;

afterEach(() => {
  if (tempRoot !== null) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  }
});

/** Arbre minimal avec la même forme que le dépôt (apps/web + registre des routes). */
function makeTree(files: Record<string, string> = FIXTURE_FILES): string {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'learny-boundary-'));
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(tempRoot, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return tempRoot;
}

describe('[SPEC-1001] web boundary', () => {
  it('reconnaît les imports serveur, même dynamiques ou par sous-chemin (CL-1)', () => {
    expect(importsServerPackage("import { home } from '@learny/services/home/derive';")).toBe(true);
    expect(importsServerPackage("const db = await import('@learny/db');")).toBe(true);
    expect(importsServerPackage("import type { X } from '@learny/tutor/demo';")).toBe(true);
    expect(importsServerPackage("import { Card } from '@learny/ui';")).toBe(false);
    expect(importsServerPackage("import { z } from '@learny/contracts';")).toBe(false);
    expect(importsServerPackage("import { helper } from '@learny/dbx';")).toBe(false);
    expect(categorizeWebFile('apps/web/proxy.ts')).toBe('proxy');
    expect(categorizeWebFile('apps/web/app/%5Fdev/sdd/spec-1-data.ts')).toBe('dev');
    expect(categorizeWebFile('apps/web/app/api/v1/home/route.ts')).toBe('apiRoutes');
    expect(categorizeWebFile('apps/web/test/unit/x.test.ts')).toBeNull();
  });

  it('n’accepte aucune exception de couplage de production', () => {
    expect(measureWebBoundary().coupled).toEqual([]);
    expect(fs.existsSync(path.join(ROOT, 'tools/migration/web-boundary-baseline.json'))).toBe(
      false,
    );
  });

  it("échoue sur une entrée qui n'importe plus de paquet serveur (EF-5, CL-2)", () => {
    const root = makeTree();
    const baseline = baselineFrom(measureWebBoundary(root));
    fs.writeFileSync(path.join(root, 'apps/web/lib/decouple.ts'), 'export const y = 1;\n');
    expect(baselineErrors(baseline, root)).toContain('entrée périmée : apps/web/lib/decouple.ts');
  });

  it('échoue sur une entrée dont le fichier a disparu (EF-5)', () => {
    const root = makeTree();
    const baseline = baselineFrom(measureWebBoundary(root));
    fs.rmSync(path.join(root, 'apps/web/lib/decouple.ts'));
    expect(baselineErrors(baseline, root)).toContain('fichier absent : apps/web/lib/decouple.ts');
  });

  it('écrit un rapport par catégorie conforme à la mesure (EF-6, CA-5)', () => {
    const measure = measureWebBoundary();
    const progress = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'progress/migration.json'), 'utf8'),
    ) as ReturnType<typeof progressFrom>;
    expect(progress).toEqual(progressFrom(measure));
  });
});

describe('[SPEC-1002] boundary', () => {
  it('les modules purs extraits sortent du couplage du web (CA-3)', () => {
    const decoupled = [
      'apps/web/components/final-review/FinalReviewScreen.tsx',
      'apps/web/components/final-review/MilestoneList.tsx',
      'apps/web/components/final-review/Stats.tsx',
      'apps/web/components/home/home-view.tsx',
      'apps/web/components/offline/OfflineQuizGlobal.tsx',
    ];
    const coupled = measureWebBoundary();
    for (const file of decoupled) {
      expect(coupled.clientComponents, file).not.toContain(file);
      expect(
        coupled.coupled.map((entry) => entry.file),
        file,
      ).not.toContain(file);
    }
  });
});

describe('[SPEC-1202] production web boundary', () => {
  it('limite les imports serveur aux démonstrations et au répertoire _dev', () => {
    const coupled = measureWebBoundary().coupled.map((entry) => entry.file);
    const allowed = coupled.every(
      (file) =>
        file.startsWith('apps/web/app/%5Fdev/') ||
        file.startsWith('apps/web/components/sdd-demos/'),
    );
    expect(coupled, 'couplage autorisé uniquement dans les démonstrations').toEqual(
      coupled.filter(
        (file) =>
          file.startsWith('apps/web/app/%5Fdev/') ||
          file.startsWith('apps/web/components/sdd-demos/'),
      ),
    );
    expect(allowed).toBe(true);
  });
});

describe('[SPEC-1203] no exception', () => {
  it('interdit les paquets serveur dans tout apps/web hors tests', () => {
    const measure = measureWebBoundary();
    expect(Object.values(measure.byCategory).every((count) => count === 0)).toBe(true);
    expect(measure.clientComponents).toEqual([]);
  });

  it('ne déclare aucun paquet serveur dans les dépendances livrées du web', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'apps/web/package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };
    const forbidden = new Set([
      '@learny/db',
      '@learny/services',
      '@learny/jobs',
      '@learny/llm',
      '@learny/tutor',
      '@learny/ingestion',
      '@learny/automations',
      '@learny/notifications',
      '@learny/http',
      '@learny/api-routes',
      'inngest',
    ]);
    expect(Object.keys(manifest.dependencies).filter((name) => forbidden.has(name))).toEqual([]);
  });
});
