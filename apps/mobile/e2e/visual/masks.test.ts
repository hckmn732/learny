// Masques de comparaison par flux (SPEC-3101, ADR-3003 § 4, ADR-3011).
//
// Un masque est un cadrage documenté : il retire de la comparaison une zone que la maquette
// dessine mais que la spécification en cours ne doit pas rendre conforme (ici les boutons Apple et
// Google, reportés à SPEC-3402 par ADR-3011). Le seuil de 12 % reste inchangé, et une différence
// hors de la zone masquée fait toujours échouer la comparaison.
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import { flowSlug } from '../artifacts.mjs';

import { compareImages, parseMask } from './compare.mjs';
import { loadFlowMask, maskRectsFor } from './masks.mjs';

const WIDTH = 100;
const HEIGHT = 200;

/** PNG uni ; `band` peint une bande noire de `top` à `bottom` (ratios de la hauteur). */
function pngWithBand(top: number | null, bottom: number): Buffer {
  const png = new PNG({ width: WIDTH, height: HEIGHT });
  png.data.fill(255);
  if (top === null) return PNG.sync.write(png);
  const y0 = Math.round(top * HEIGHT);
  const y1 = Math.round(bottom * HEIGHT);
  for (let y = y0; y < y1; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const index = (WIDTH * y + x) << 2;
      png.data[index] = 0;
      png.data[index + 1] = 0;
      png.data[index + 2] = 0;
    }
  }
  return PNG.sync.write(png);
}

/** Masque du flux SPEC-3101, converti pour une référence de `WIDTH × HEIGHT`. */
function specMask(): { x: number; y: number; width: number; height: number }[] {
  const rects = maskRectsFor('SPEC-3101 connexion', WIDTH, HEIGHT);
  if (rects === null) throw new Error('masque du flux absent');
  return rects;
}

describe('[SPEC-3101] masques de comparaison visuelle', () => {
  it('lit le masque du flux en ratios', () => {
    const mask = loadFlowMask('SPEC-3101 connexion');

    if (mask === null) throw new Error('masque du flux absent');
    expect(mask).toHaveLength(1);
    expect(mask[0]).toMatchObject({ x: 0, y: 0.688, width: 1, height: 0.114 });
  });

  it('convertit le masque en pixels de la référence, zones natives comprises', () => {
    const rects = maskRectsFor('SPEC-3101 connexion', 824, 1830);

    if (rects === null) throw new Error('masque du flux absent');
    const native = parseMask('top=0.05,bottom=0.05', 824, 1830);
    expect(rects.slice(0, native.length)).toEqual(native);
    expect(rects.at(-1)).toEqual({
      x: 0,
      y: Math.round(0.688 * 1830),
      width: 824,
      height: Math.round(0.114 * 1830),
    });
  });

  it('ne change rien pour un flux sans fichier de masque', () => {
    expect(loadFlowMask('SPEC-3999 flux inconnu')).toBeNull();
    expect(maskRectsFor('SPEC-3999 flux inconnu', WIDTH, HEIGHT)).toBeNull();
  });

  it('nomme le fichier avec le même identifiant que le rapport de flux', () => {
    expect(flowSlug('SPEC-3101 connexion')).toBe('spec-3101-connexion');
  });

  it('recalcule le ratio : une différence dans la zone masquée ne compte plus', () => {
    const baseline = pngWithBand(null, 0);
    const insideBand = pngWithBand(0.7, 0.78);

    // Seuil resserré : la bande de test fait moins de 12 % de l'image, or c'est le cadrage
    // qu'on éprouve ici, pas le seuil de la spécification.
    const withoutMask = compareImages(insideBand, baseline, { threshold: 0.01 });
    expect(withoutMask.ok).toBe(false);
    expect(withoutMask.diffRatio).toBeGreaterThan(0);

    const withMask = compareImages(insideBand, baseline, { masks: specMask(), threshold: 0.01 });
    expect(withMask.ok).toBe(true);
    expect(withMask.diffRatio).toBe(0);
  });

  it('laisse échouer une différence hors de la zone masquée', () => {
    const baseline = pngWithBand(null, 0);
    const outsideBand = pngWithBand(0.4, 0.5);

    const withMask = compareImages(outsideBand, baseline, { masks: specMask(), threshold: 0.01 });
    expect(withMask.ok).toBe(false);
    expect(withMask.diffRatio).toBeGreaterThan(0.01);
  });
});
