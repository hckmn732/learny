// Builds a minimal, self-consistent SDD repository in a temporary directory (SPEC-003, ET-5).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const HEADINGS = [
  '## 1. Objectif',
  '## 2. Contexte',
  '## 3. Dépendances',
  '## 4. Règles métier couvertes',
  '## 5. Exigences fonctionnelles',
  '## 6. Exigences techniques',
  '## 7. Comportements attendus et cas limites',
  "## 8. Instructions d'implémentation",
  '## 9. Fichiers et composants concernés',
  '## 10. Interface et conformité visuelle',
  "## 11. Critères d'acceptation",
  '## 12. Plan de tests',
  '## 13. Preuves attendues',
  '## 14. Définition de terminé',
  '## 15. Décisions et hypothèses',
];

export interface FixtureSpec {
  id: string;
  dependsOn: string[];
}

export const DEFAULT_SPECS: FixtureSpec[] = [
  { id: 'SPEC-001', dependsOn: [] },
  { id: 'SPEC-002', dependsOn: ['SPEC-001'] },
  { id: 'SPEC-003', dependsOn: ['SPEC-001'] },
];

export function specBody(id: string, dependsOn: string[], omit: string[] = []): string {
  const sections = HEADINGS.filter((h) => !omit.includes(h)).map((h) => {
    if (h.startsWith('## 4.')) return `${h}\n\n- **BR-TST-01** — règle de test.\n`;
    if (h.startsWith('## 11.'))
      return `${h}\n\n- **CA-1** — un.\n- **CA-2** — deux.\n- **CA-3** — trois.\n`;
    if (h.startsWith('## 12.'))
      return `${h}\n\n- Unitaires \`[${id}]\`, e2e \`@${id}\`, visuel \`@visual\` : CA-1, CA-2, CA-3.\n`;
    if (h.startsWith('## 15.')) return `${h}\n\nADR-0001.\n`;
    return `${h}\n\nTexte.\n`;
  });
  return `---\nid: ${id}\ntitle: Titre ${id}\nphase: P0\npriority: V1\ndepends_on: [${dependsOn.join(', ')}]\nbusiness_rules: [BR-TST-01]\nscreens: []\nadrs: [ADR-0001]\nvisual: demo\n---\n\n# ${id}\n\n${sections.join('\n')}`;
}

export function createFixture(specs: FixtureSpec[] = DEFAULT_SPECS): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'learny-sdd-'));
  const write = (rel: string, content: string) => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  const catalog = {
    project: 'Fixture',
    version: 1,
    phases: [
      { id: 'P0', dir: 'p0', title: 'Phase zéro', checkpoint: 'CP-0' },
      { id: 'P1', dir: 'p1', title: 'Phase un', checkpoint: 'CP-1' },
    ],
    specs: specs.map((s) => ({
      id: s.id,
      title: `Titre ${s.id}`,
      phase: 'P0',
      priority: 'V1',
      path: `specs/p0/${s.id}-titre.md`,
      dependsOn: s.dependsOn,
      businessRules: ['BR-TST-01'],
      screens: [],
      adrs: ['ADR-0001'],
      visual: 'demo',
    })),
  };
  write('specs/catalog.json', JSON.stringify(catalog, null, 2));
  write('specs/checkpoints.md', '# Checkpoints\n\n## CP-0\n\nPhase zéro.\n\n## CP-1\n\nPhase un.\n');
  write('docs/product/business-rules.md', '| Règle | Texte |\n|---|---|\n| BR-TST-01 | Test |\n');
  write('docs/product/screens.md', '| Écran | Nom |\n|---|---|\n');
  write('docs/adr/ADR-0001-boucle.md', '# ADR-0001 — Boucle\n');
  write('docs/adr/README.md', '| ADR | Titre | Origine | Liens |\n|---|---|---|---|\n');
  for (const s of specs) write(`specs/p0/${s.id}-titre.md`, specBody(s.id, s.dependsOn));
  return root;
}

export function removeFixture(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}
