// SPEC-802 ET-5, CA-6 — the manifest carries the four mobile « menu masqué » references and the
// files exist with the dimensions it declares.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { pngSize, validateScenarios } from '../../../design/manifest.mjs';
import { SCENARIOS, VIEWPORTS } from '../../../design/scenarios.mjs';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const REFERENCES = path.join(ROOT, 'design', 'references');

interface ManifestEntry {
  screenId: string;
  state: string;
  viewport: string;
  file: string;
  width: number;
  height: number;
  sha256: string;
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(REFERENCES, 'manifest.json'), 'utf8'),
) as { references: ManifestEntry[] };

describe('[SPEC-802] références mobiles menu masqué', () => {
  it('déclare les quatre scénarios mobiles sans conflit', () => {
    expect(validateScenarios(SCENARIOS, VIEWPORTS)).toEqual([]);
    const states = SCENARIOS.filter((scenario) => scenario.state === 'menu-masque');
    expect(states.map((scenario) => scenario.screenId)).toEqual([
      'SCR-03',
      'SCR-07',
      'SCR-10',
      'SCR-12',
    ]);
    for (const scenario of states) expect(scenario.viewports).toEqual(['mobile']);
  });

  it('publie les quatre PNG avec les dimensions du manifeste', () => {
    const entries = manifest.references.filter((entry) => entry.state === 'menu-masque');
    expect(entries.map((entry) => entry.screenId)).toEqual([
      'SCR-03',
      'SCR-07',
      'SCR-10',
      'SCR-12',
    ]);
    for (const entry of entries) {
      const file = path.join(ROOT, entry.file);
      expect(fs.existsSync(file), entry.file).toBe(true);
      const size = pngSize(fs.readFileSync(file));
      expect(size).toEqual({ width: entry.width, height: entry.height });
      expect(entry.viewport).toBe('mobile');
    }
  });
});
