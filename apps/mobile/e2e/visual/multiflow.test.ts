// Comparaison visuelle multi-flux (ADR-3015 § 2 et § 4).
//
// Le défaut corrigé : l'ancien lanceur indexait les captures par nom de fichier, si bien que
// plusieurs flux visuels héritaient de la même image et rendaient le même `diffRatio`. Le test de
// régression ci-dessous échoue avec cet ancien comportement, puisque trois flux y produisent trois
// ratios distincts.
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import { attributeArtifacts, screenshotsForFlow } from '../artifacts.mjs';

import { compareFlows, DEFAULT_THRESHOLD } from './compare.mjs';

const WIDTH = 100;
const HEIGHT = 200;
const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

/** Image unie, éventuellement repeinte sur une bande supérieure (fraction de la hauteur). */
function image(fraction = 0): Buffer {
  const png = new PNG({ width: WIDTH, height: HEIGHT });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = WHITE[0];
    png.data[i + 1] = WHITE[1];
    png.data[i + 2] = WHITE[2];
    png.data[i + 3] = 255;
  }
  const height = Math.round(HEIGHT * fraction);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const index = (WIDTH * y + x) << 2;
      png.data[index] = BLACK[0];
      png.data[index + 1] = BLACK[1];
      png.data[index + 2] = BLACK[2];
      png.data[index + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

const FLOWS = [
  { name: 'SPEC-3101 connexion', file: 'SPEC-3101-connexion.yaml' },
  { name: 'SPEC-3102 coquille', file: 'SPEC-3102-coquille.yaml' },
  { name: 'SPEC-3103 profil', file: 'SPEC-3103-profil.yaml' },
];

const FRACTIONS = [0.02, 0.2, 0.45];

/** Trois captures distinctes, telles que l'agent les renvoie avec leur flux. */
function captures() {
  return FLOWS.map((flow, index) => ({
    flow: flow.name,
    name: `${flow.file.replace(/\.yaml$/, '')}.png`,
    path: `${flow.name}/takeScreenshot/${flow.file.replace(/\.yaml$/, '')}.png`,
    buffer: image(FRACTIONS[index] ?? 0),
  }));
}

describe('[SPEC-3001] comparaison visuelle flux par flux', () => {
  it('donne un ratio distinct par flux quand chaque flux a sa capture (régression corrigée)', () => {
    const artifacts = captures();
    const { byFlow, unattributed } = attributeArtifacts({ flows: FLOWS, artifacts });

    expect(unattributed).toEqual([]);

    const results = compareFlows(
      FLOWS.map((flow) => {
        const capture = screenshotsForFlow(byFlow, flow)[0];
        expect(capture).toBeDefined();
        return { flow: flow.name, capture: capture?.buffer ?? null, baseline: image(0) };
      }),
    );

    expect(results).toHaveLength(3);
    const ratios = results.map((entry) => Number((entry.diffRatio ?? -1).toFixed(4)));
    expect(new Set(ratios).size).toBe(3);
    // Le seuil est appliqué à chaque flux, séparément.
    expect(results.map((entry) => entry.status)).toEqual(['passed', 'failed', 'failed']);
    expect(ratios[0]).toBeLessThanOrEqual(DEFAULT_THRESHOLD);
    expect(ratios[1]).toBeGreaterThan(DEFAULT_THRESHOLD);
    expect(ratios[2]).toBeGreaterThan(ratios[1] ?? 0);
  });

  it('détecte le défaut historique : une seule capture partagée donne trois ratios identiques', () => {
    const shared = image(FRACTIONS[0] ?? 0);
    const results = compareFlows(
      FLOWS.map((flow) => ({ flow: flow.name, capture: shared, baseline: image(0) })),
    );

    expect(new Set(results.map((entry) => entry.diffRatio)).size).toBe(1);
    expect(results.map((entry) => entry.status)).toEqual(['passed', 'passed', 'passed']);
  });

  it('nomme les flux sans capture et sans référence au lieu de comparer au hasard', () => {
    const results = compareFlows([
      { flow: 'sans-capture', capture: null, baseline: image(0) },
      { flow: 'sans-reference', capture: image(0), baseline: null },
    ]);

    expect(results.map((entry) => entry.status)).toEqual(['no-capture', 'baseline-created']);
    expect(results.map((entry) => entry.diffRatio)).toEqual([null, null]);
  });

  it('rend le diff de chaque flux (un PNG par comparaison)', () => {
    const results = compareFlows([
      { flow: 'a', capture: image(0.5), baseline: image(0) },
      { flow: 'b', capture: image(0.8), baseline: image(0) },
    ]);

    expect(results[0]?.diffPng).not.toBeNull();
    expect(results[1]?.diffPng).not.toBeNull();
  });
});
