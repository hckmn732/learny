// SPEC-807 §12 — unit tests of the journey matrix validator (CA-5): a minimal repository is built
// in a temporary folder, then each rule is broken in turn.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  JOURNEY_IDS,
  REPO,
  VISUAL_SCREENS,
  checkJourneys,
  loadRoutes,
  parseMatrix,
  routeProblem,
} from '../../check-v1-journeys.mjs';

const TEST = 'apps/web/e2e/journeys/parcours.spec.ts';
const VISUAL = 'apps/web/e2e/journeys/visual-regression.spec.ts';
const PROOFS =
  '[rapport JSON](../../evidence/SPEC-807/journeys.json) · [vidéos](../../evidence/SPEC-807/video/)';
const HEADER =
  '| Étape | Action | Route | Spécification | Règles métier | Fixture | Test |\n|---|---|---|---|---|---|---|';

let root: string;

function write(relative: string, content: string): void {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function step(id: string, overrides: Partial<Record<string, string>> = {}): string {
  const cells = {
    action: `Action ${id}`,
    route: '`/accueil`, `POST /api/v1/me/export`',
    spec: 'SPEC-211',
    rules: 'BR-ACC-10',
    fixture: '`packages/testing/src/factories/user.ts`',
    test: `\`${TEST}\``,
    ...overrides,
  };
  return `| ${id} | ${cells.action} | ${cells.route} | ${cells.spec} | ${cells.rules} | ${cells.fixture} | ${cells.test} |`;
}

function journey(id: string, rows: string[], proofs = PROOFS): string {
  return [
    `## ${id} — Parcours ${id}`,
    '',
    `- Fichier de test : \`${TEST}\``,
    `- Test : \`parcours ${id} @SPEC-807\``,
    `- Preuves : ${proofs}`,
    '',
    HEADER,
    ...rows,
    '',
  ].join('\n');
}

function visual(screens: readonly string[] = VISUAL_SCREENS): string {
  return [
    '## EF-7 — Régression visuelle',
    '',
    `- Fichier de test : \`${VISUAL}\``,
    '- Test : `régression des écrans V1 @SPEC-807 @visual`',
    '- Preuves : [ratios](../../evidence/SPEC-807/visual/ratios.json)',
    '',
    '| Écran | État capturé | Route | Spécification | Référence | Test |',
    '|---|---|---|---|---|---|',
    ...screens.map(
      (screen) =>
        `| ${screen} | État ${screen} | \`/accueil\` | SPEC-211 | \`design/references/${screen}-base-desktop.png\` | \`${VISUAL}\` |`,
    ),
    '',
  ].join('\n');
}

function matrix(parts: { journeys?: string[]; visual?: string } = {}): string {
  const journeys =
    parts.journeys ??
    JOURNEY_IDS.map((id: string) =>
      journey(id, [step(`J${id.slice(3)}.01`), step(`J${id.slice(3)}.02`)]),
    );
  return ['# Matrice', '', ...journeys, parts.visual ?? visual()].join('\n');
}

function check(text: string, options: { requireEvidence?: boolean } = {}) {
  write('docs/quality/v1-journeys.md', text);
  return checkJourneys({ root, ...options });
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'learny-journeys-'));
  write(
    'specs/catalog.json',
    JSON.stringify({
      specs: [
        {
          id: 'SPEC-211',
          priority: 'V1',
          businessRules: ['BR-ACC-10'],
          path: 'specs/p2/SPEC-211.md',
        },
        {
          id: 'SPEC-601',
          priority: 'V1',
          businessRules: ['BR-ACC-01'],
          path: 'specs/p6/SPEC-601.md',
        },
        { id: 'SPEC-807', priority: 'V1', businessRules: [], path: 'specs/p8/SPEC-807.md' },
        {
          id: 'SPEC-901',
          priority: 'V2',
          businessRules: ['BR-ACC-10'],
          path: 'specs/p9/SPEC-901.md',
        },
      ],
    }),
  );
  write('specs/p2/SPEC-211.md', 'Export et suppression : BR-ACC-11.\n');
  write('specs/p6/SPEC-601.md', 'Inscription.\n');
  write(
    'docs/product/business-rules.md',
    [
      '| ID | Règle | Version | Source |',
      '|---|---|---|---|',
      '| BR-ACC-01 | Inscription. | V1 | M |',
      '| BR-ACC-10 | Export. | V1 | L |',
      '| BR-ACC-11 | Suppression. | V1 | L |',
      '| BR-ACC-99 | Futur. | V2 | L |',
      '',
    ].join('\n'),
  );
  write('apps/web/app/(app)/accueil/page.tsx', 'export default function P() {}\n');
  write(
    'apps/web/app/(app)/formations/[fid]/programme/page.tsx',
    'export default function P() {}\n',
  );
  write('apps/web/app/%5Fdev/sdd/page.tsx', 'export default function P() {}\n');
  write('apps/web/app/api/v1/me/export/route.ts', 'export const POST = handler();\n');
  write('apps/web/app/api/v1/me/deletion/route.ts', 'export async function DELETE() {}\n');
  write('packages/testing/src/factories/user.ts', 'export {};\n');
  write(TEST, "test('parcours @SPEC-807', () => {});\n");
  write(VISUAL, "test('régression @SPEC-807 @visual', () => {});\n");
  const references = VISUAL_SCREENS.map(
    (screen: string) => `design/references/${screen}-base-desktop.png`,
  );
  for (const file of references) write(file, 'png');
  write(
    'design/references/manifest.json',
    JSON.stringify({ references: references.map((file: string) => ({ file })) }),
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('[SPEC-807] journey matrix', () => {
  it('accepte une matrice complète et compte les étapes', () => {
    const report = check(matrix());
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.journeys).toBe(6);
    expect(report.steps).toBe(12);
  });

  it('résout les routes de l’app router (groupes, %5F, segments dynamiques, méthodes)', () => {
    write('docs/quality/v1-journeys.md', '');
    const routes = loadRoutes(root);
    expect(routeProblem('/accueil', routes)).toBeNull();
    expect(routeProblem('/accueil?vue=semaine', routes)).toBeNull();
    expect(routeProblem('/_dev/sdd', routes)).toBeNull();
    expect(routeProblem('/formations/[fid]/programme', routes)).toBeNull();
    expect(routeProblem('/formations/abc/programme', routes)).toBeNull();
    expect(routeProblem('DELETE /api/v1/me/deletion', routes)).toBeNull();
    expect(routeProblem('/inexistante', routes)).toContain('route inexistante');
    expect(routeProblem('GET /api/v1/me/export', routes)).toContain('méthode GET absente');
    expect(routeProblem('accueil', routes)).toContain('mal formée');
  });

  it('refuse une route inexistante', () => {
    const report = check(
      matrix({
        journeys: JOURNEY_IDS.map((id: string) =>
          journey(id, [step(`J${id.slice(3)}.01`, { route: '`/formations/[fid]/inconnue`' })]),
        ),
      }),
    );
    expect(report.ok).toBe(false);
    expect(report.errors).toContain('EF-1 J1.01 : route inexistante /formations/[fid]/inconnue');
  });

  it('refuse une étape sans propriétaire, inconnue du catalogue, V2 ou SPEC-807', () => {
    const rows = [
      step('J1.01', { spec: '—' }),
      step('J1.02', { spec: 'SPEC-999' }),
      step('J1.03', { spec: 'SPEC-901' }),
      step('J1.04', { spec: 'SPEC-807', rules: 'BR-ACC-10' }),
    ];
    const report = check(
      matrix({
        journeys: [
          journey('EF-1', rows),
          ...JOURNEY_IDS.slice(1).map((id: string) => journey(id, [step(`J${id.slice(3)}.01`)])),
        ],
      }),
    );
    expect(report.errors).toEqual(
      expect.arrayContaining([
        'EF-1 J1.01 : étape sans propriétaire (spécification « — »)',
        'EF-1 J1.02 : SPEC-999 absente de specs/catalog.json',
        "EF-1 J1.03 : SPEC-901 n'est pas une spécification V1",
        "EF-1 J1.04 : SPEC-807 ne peut pas être propriétaire d'une étape",
      ]),
    );
  });

  it('vérifie les règles métier : existence, version V1 et rattachement au propriétaire', () => {
    const rows = [
      step('J1.01', { rules: '' }),
      step('J1.02', { rules: 'BR-ACC-77' }),
      step('J1.03', { rules: 'BR-ACC-99' }),
      step('J1.04', { rules: 'BR-ACC-01' }),
      // Mentioned in the owner's specification text: accepted.
      step('J1.05', { rules: 'BR-ACC-11' }),
      step('J1.06', { rules: 'BR-ACC-10, BR-ACC-10' }),
    ];
    const report = check(
      matrix({
        journeys: [
          journey('EF-1', rows),
          ...JOURNEY_IDS.slice(1).map((id: string) => journey(id, [step(`J${id.slice(3)}.01`)])),
        ],
      }),
    );
    expect(report.errors).toEqual([
      'EF-1 J1.01 : aucune règle métier',
      'EF-1 J1.02 : BR-ACC-77 absente de docs/product/business-rules.md',
      "EF-1 J1.03 : BR-ACC-99 n'est pas une règle V1 (V2)",
      "EF-1 J1.04 : BR-ACC-01 n'est pas rattachée à SPEC-211",
      'EF-1 J1.06 : règle BR-ACC-10 en doublon',
    ]);
  });

  it('refuse les doublons d’étape, d’action et de parcours', () => {
    const report = check(
      matrix({
        journeys: [
          journey('EF-1', [
            step('J1.01'),
            step('J1.01', { action: 'Autre' }),
            step('J1.02', { action: 'Action J1.01' }),
          ]),
          journey('EF-1', [step('J1.03')]),
          ...JOURNEY_IDS.slice(1).map((id: string) => journey(id, [step(`J${id.slice(3)}.01`)])),
        ],
      }),
    );
    expect(report.errors).toEqual(
      expect.arrayContaining([
        'EF-1 J1.01 : étape en doublon',
        'EF-1 J1.02 : action en doublon dans le parcours',
        'EF-1 : parcours en doublon',
      ]),
    );
  });

  it('exige les six parcours, un identifiant J<n>.nn et la section visuelle', () => {
    const report = check(matrix({ journeys: [journey('EF-1', [step('J2.01')])], visual: '' }));
    expect(report.errors).toEqual(
      expect.arrayContaining([
        "EF-1 J2.01 : identifiant d'étape attendu J1.nn",
        'EF-2 : parcours absent de la matrice',
        'EF-6 : parcours absent de la matrice',
        'EF-7 : section de régression visuelle absente',
      ]),
    );
  });

  it('vérifie les fichiers de test, leur tag @SPEC-807 et les fixtures', () => {
    write('apps/web/e2e/journeys/sans-tag.spec.ts', "test('x', () => {});\n");
    const rows = [
      step('J1.01', { test: '`apps/web/e2e/journeys/absent.spec.ts`' }),
      step('J1.02', { test: '`apps/web/e2e/journeys/sans-tag.spec.ts`' }),
      step('J1.03', { test: '`apps/web/e2e/specs/p6/ailleurs.spec.ts`' }),
      step('J1.04', { fixture: '`packages/testing/src/factories/absente.ts`' }),
      step('J1.05', { fixture: '' }),
    ];
    const report = check(
      matrix({
        journeys: [
          journey('EF-1', rows),
          ...JOURNEY_IDS.slice(1).map((id: string) => journey(id, [step(`J${id.slice(3)}.01`)])),
        ],
      }),
    );
    expect(report.errors).toEqual(
      expect.arrayContaining([
        'EF-1 J1.01 : fichier de test inexistant apps/web/e2e/journeys/absent.spec.ts',
        'EF-1 J1.02 : apps/web/e2e/journeys/sans-tag.spec.ts ne porte pas @SPEC-807',
        'EF-1 J1.03 : le test doit vivre dans apps/web/e2e/journeys/ (apps/web/e2e/specs/p6/ailleurs.spec.ts)',
        'EF-1 J1.04 : fixture inexistante packages/testing/src/factories/absente.ts',
        'EF-1 J1.05 : aucune fixture',
      ]),
    );
  });

  it('refuse une preuve cochée d’avance ou hors de evidence/SPEC-807', () => {
    const report = check(
      matrix({
        journeys: [
          journey('EF-1', [step('J1.01')], '✅ Réussi'),
          journey('EF-2', [step('J2.01')], '[x] [rapport](../../evidence/SPEC-807/journeys.json)'),
          journey('EF-3', [step('J3.01')], '[rapport](../../evidence/SPEC-805/e2e.json)'),
          journey('EF-4', [step('J4.01')], '[Réussi](../../evidence/SPEC-807/journeys.json)'),
          ...['EF-5', 'EF-6'].map((id) => journey(id, [step(`J${id.slice(3)}.01`)])),
        ],
      }),
    );
    expect(report.errors).toEqual(
      expect.arrayContaining([
        'EF-1 : les preuves doivent être des liens vers evidence/SPEC-807/',
        "EF-1 : preuve pré-remplie (statut ou case cochée) au lieu d'un lien de rapport",
        "EF-2 : preuve pré-remplie (statut ou case cochée) au lieu d'un lien de rapport",
        'EF-3 : preuve hors de evidence/SPEC-807/ (../../evidence/SPEC-805/e2e.json)',
        "EF-4 : preuve pré-remplie (statut ou case cochée) au lieu d'un lien de rapport",
      ]),
    );
  });

  it('exige l’existence des rapports avec requireEvidence', () => {
    const text = matrix();
    expect(check(text, { requireEvidence: true }).errors).toContain(
      'EF-1 : rapport de preuve absent evidence/SPEC-807/journeys.json',
    );
    write('evidence/SPEC-807/journeys.json', '{}');
    fs.mkdirSync(path.join(root, 'evidence/SPEC-807/video'), { recursive: true });
    write('evidence/SPEC-807/visual/ratios.json', '{}');
    expect(check(text, { requireEvidence: true }).errors).toEqual([]);
  });

  it('contrôle la section visuelle : cinq écrans, références du manifeste', () => {
    write('design/references/manifest.json', JSON.stringify({ references: [] }));
    const report = check(matrix({ visual: visual(['SCR-01', 'SCR-01']) }));
    expect(report.errors).toEqual(
      expect.arrayContaining([
        'EF-7 SCR-01 : design/references/SCR-01-base-desktop.png absente du manifeste',
        'EF-7 SCR-01 : écran en doublon',
        'EF-7 : écran SCR-10 absent',
      ]),
    );
  });

  it('lit la matrice réelle du dépôt', () => {
    const real = fs.readFileSync(path.join(REPO, 'docs', 'quality', 'v1-journeys.md'), 'utf8');
    const sections = parseMatrix(real);
    expect(sections.map((section) => section.id)).toEqual([...JOURNEY_IDS, 'EF-7']);
    for (const section of sections) {
      expect(section.rows.length, section.id).toBeGreaterThan(0);
      expect(String(section.proofs), section.id).toContain('evidence/SPEC-807/');
    }
  });
});
