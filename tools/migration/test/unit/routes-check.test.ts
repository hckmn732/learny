// SPEC-1004 §12 — génération de l'arborescence Next depuis les deux tables : registre réduit,
// dérive, fichier orphelin, doublon, et contenu sans logique (CA-2, CA-4, CL-2, CL-3).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  check,
  expectedRouteFiles,
  filePathOf,
  plannedFiles,
  renderFile,
  SEGMENT_OPTIONS,
} from '../../generate-next-routes.mjs';

const ROUTES_SOURCE = `import { demoRoutes } from './demo';

export const ROUTES = {
  ...demoRoutes,
} as const;

export type RouteName = keyof typeof ROUTES;
`;

const DEMO_CONTRACT = `import { defineRoute } from './define-route';

export const demoGet = defineRoute({
  id: 'demo.get',
  method: 'GET',
  path: '/api/v1/demo',
  auth: 'user',
  output: null,
  successStatus: 200,
  summary: 'Démo.',
  errors: [],
});

export const demoSpecial = defineRoute({
  id: 'demo.special',
  method: 'POST',
  path: '/api/v1/demo/special',
  auth: 'user',
  output: null,
  successStatus: 200,
  summary: 'Démo spéciale.',
  errors: [],
});

export const demoRoutes = { demoGet, demoSpecial } as const;
`;

const MANIFEST_SOURCE = `export const SPECIAL_ROUTE_MANIFEST = [
  { key: 'demoSpecial', method: 'POST', path: '/api/v1/demo/special' },
  { key: 'inngest', method: 'ALL', path: '/api/inngest' },
] as const;
`;

const GENERATED_DEMO = `// generated
import { nextRoute } from '../../../lib/api/next-route';

export const dynamic = 'force-dynamic';

export const GET = nextRoute('demoGet');
`;

let tempRoot: string | null = null;

afterEach(() => {
  if (tempRoot !== null) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  }
});

function write(root: string, relative: string, content: string): void {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** Arbre minimal : contrat, manifeste, une route générée (même forme que le dépôt). */
function makeTree(): string {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'learny-routes-'));
  write(tempRoot, 'packages/contracts/src/routes.ts', ROUTES_SOURCE);
  write(tempRoot, 'packages/contracts/src/demo.ts', DEMO_CONTRACT);
  write(tempRoot, 'packages/api-routes/src/special/manifest.ts', MANIFEST_SOURCE);
  const app = path.join(tempRoot, 'apps/web/app');
  for (const [relative, file] of plannedFiles(tempRoot).files) {
    write(app, relative, file.content);
  }
  return tempRoot;
}

describe('[SPEC-1004] next routes generation', () => {
  it('déduit un fichier par chemin depuis les tables (EF-3)', () => {
    const root = makeTree();
    const { files } = plannedFiles(root);
    expect([...files.keys()].sort()).toEqual([
      'api/inngest/route.ts',
      'api/v1/demo/route.ts',
      'api/v1/demo/special/route.ts',
    ]);
    expect(files.get('api/v1/demo/route.ts')?.content).toContain("nextRoute('demoGet')");
    const inngest = files.get('api/inngest/route.ts');
    expect(inngest?.content).toContain("nextSpecial('inngest')");
    expect(inngest?.methods).toEqual(['GET', 'POST', 'PUT']);
  });

  it('produit un fichier sans logique : imports, options de segment, délégations (CA-4)', () => {
    const root = makeTree();
    const { files } = plannedFiles(root);
    const allowed = /^(import |\/\/|$)/;
    for (const [relative, file] of files) {
      const imports = file.content.match(/^import .*$/gm) ?? [];
      expect(imports, relative).toHaveLength(1);
      expect(imports[0], relative).toMatch(/lib\/api\/next-route';$/);
      for (const line of file.content.split('\n')) {
        if (!line.startsWith('export const ')) {
          expect(allowed.test(line), `${relative}: ${line}`).toBe(true);
          continue;
        }
        if (/^export const (dynamic|runtime|maxDuration) = /.test(line)) continue;
        expect(line, relative).toMatch(
          /^export const (GET|POST|PUT|PATCH|DELETE) = (nextRoute|nextSpecial)\('[\w.]+'\);$/,
        );
      }
    }
    expect(SEGMENT_OPTIONS['api/v1/me/route.ts']).toEqual({ runtime: 'nodejs' });
  });

  it('accepte une arborescence conforme (CA-2)', () => {
    const root = makeTree();
    const report = check(root);
    expect(report.drift).toEqual([]);
    expect(report.missing).toEqual([]);
    expect(report.orphans).toEqual([]);
    expect(report.duplicates).toEqual([]);
    expect(report.planned).toBe(3);
  });

  it('signale une dérive, un fichier orphelin et une entrée sans fichier (CL-3, EF-4)', () => {
    const root = makeTree();
    fs.appendFileSync(
      path.join(root, 'apps/web/app/api/v1/demo/route.ts'),
      '\n// édité à la main\n',
    );
    write(root, 'apps/web/app/api/v1/oubliee/route.ts', GENERATED_DEMO);
    fs.rmSync(path.join(root, 'apps/web/app/api/v1/demo/special/route.ts'));
    const report = check(root);
    expect(report.drift).toEqual(['api/v1/demo/route.ts']);
    expect(report.orphans).toEqual(['api/v1/oubliee/route.ts']);
    expect(report.missing).toEqual(['api/v1/demo/special/route.ts']);
  });

  it('signale un doublon méthode + chemin (CL-2)', () => {
    const root = makeTree();
    write(
      root,
      'packages/api-routes/src/special/manifest.ts',
      `export const SPECIAL_ROUTE_MANIFEST = [
  { key: 'demoSpecial', method: 'POST', path: '/api/v1/demo/special' },
  { key: 'demoGet', method: 'POST', path: '/api/v1/demo/special' },
  { key: 'inngest', method: 'ALL', path: '/api/inngest' },
] as const;
`,
    );
    expect(check(root).duplicates).toContain('POST /api/v1/demo/special');
  });

  it('garde les options de segment et le chemin privé _dev (EF-3)', () => {
    const files = expectedRouteFiles();
    expect(files).toContainEqual({ path: 'api/v1/%5Fdev/demo-job/route.ts', methods: ['POST'] });
    const rendered = renderFile(
      'api/v1/me/route.ts',
      new Map([['GET', { key: 'meGet', special: false }]]),
    );
    expect(rendered).toContain("export const runtime = 'nodejs';");
    expect(rendered).toContain("export const GET = nextRoute('meGet');");
    expect(rendered.match(/^import .*$/gm)).toHaveLength(1);
  });

  it('normalise les paramètres et le dossier privé (EF-3)', () => {
    expect(filePathOf('/api/v1/formations/:fid/sprints')).toBe(
      'api/v1/formations/[fid]/sprints/route.ts',
    );
    expect(filePathOf('/api/v1/_dev/secret-scan')).toBe('api/v1/%5Fdev/secret-scan/route.ts');
    expect(filePathOf('/api/inngest')).toBe('api/inngest/route.ts');
  });
});
