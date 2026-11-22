// Unit tests of the artifact association (SPEC-3002, non-régression du transport, ADR-3012).
// The previous transport stamped one screenshot under every flow name: three visual flows then
// compared the same image and reported the same ratio. These tests fail on that behaviour.
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import { associateArtifacts, pickCapture } from './artifacts.mjs';
import { compareImages } from './compare.mjs';

const FLOWS = [
  { name: 'SPEC-3002 jetons', base: 'SPEC-3002-jetons' },
  { name: 'SPEC-3002 controles', base: 'SPEC-3002-controles' },
  { name: 'SPEC-3002 feuilles', base: 'SPEC-3002-feuilles' },
];

describe('[SPEC-3002] transport des artefacts par flux', () => {
  it('attribue chaque capture au flux qui l’a produite', () => {
    const { entries, unassigned } = associateArtifacts(
      [
        { name: 'SPEC-3002-jetons.png', flow: 'SPEC-3002 jetons' },
        { name: 'SPEC-3002-controles.png', flow: 'SPEC-3002 controles' },
        { name: 'SPEC-3002-feuilles.png', flow: 'SPEC-3002 feuilles' },
      ],
      FLOWS,
    );
    expect(unassigned).toEqual([]);
    expect([...entries.values()].map((entry) => pickCapture(entry)?.name)).toEqual([
      'SPEC-3002-jetons.png',
      'SPEC-3002-controles.png',
      'SPEC-3002-feuilles.png',
    ]);
  });

  it('n’attribue pas à un flux la capture d’un autre flux (régression : ratio identique)', () => {
    // Exactly what the old agent produced: one screenshot, stamped under all three names.
    const previous = [
      { name: 'SPEC-3002-jetons.png', flow: 'screen' },
      { name: 'SPEC-3002-controles.png', flow: 'screen' },
      { name: 'SPEC-3002-feuilles.png', flow: 'screen' },
    ];
    const { entries, unassigned } = associateArtifacts(previous, FLOWS);
    expect(unassigned).toHaveLength(3);
    for (const entry of entries.values()) expect(pickCapture(entry)).toBeNull();
  });

  it('accepte un artefact nommé d’après le fichier du flux, sans étiquette', () => {
    const { entries } = associateArtifacts([{ name: 'SPEC-3002-controles.png' }], FLOWS);
    expect(pickCapture(entries.get('SPEC-3002-controles'))?.name).toBe('SPEC-3002-controles.png');
    expect(pickCapture(entries.get('SPEC-3002-jetons'))).toBeNull();
  });

  it('préfère la capture nommée d’après le flux à une capture d’étape', () => {
    const { entries } = associateArtifacts(
      [
        { name: 'step-012-assert.png', flow: 'SPEC-3002 feuilles' },
        { name: 'SPEC-3002-feuilles.png', flow: 'SPEC-3002 feuilles' },
      ],
      FLOWS,
    );
    expect(pickCapture(entries.get('SPEC-3002-feuilles'))?.name).toBe('SPEC-3002-feuilles.png');
  });

  it('trie vidéos et captures, et ignore une étiquette inconnue', () => {
    const { entries, unassigned } = associateArtifacts(
      [
        { name: 'SPEC-3002-jetons.mp4', flow: 'SPEC-3002 jetons' },
        { name: 'SPEC-3002-jetons.png', flow: 'SPEC-3002 jetons' },
        { name: 'orphelin.png', flow: 'flux absent' },
      ],
      FLOWS,
    );
    expect(entries.get('SPEC-3002-jetons')?.videos).toHaveLength(1);
    expect(entries.get('SPEC-3002-jetons')?.screenshots).toHaveLength(1);
    expect(unassigned.map((artifact) => artifact.name)).toEqual(['orphelin.png']);
  });
});

/** Flat image of one colour; `paint` repaints a rectangle, so the ratio is exactly predictable. */
function image(
  base: [number, number, number],
  paint?: { width: number; height: number; colour: [number, number, number] },
): Buffer {
  const png = new PNG({ width: 100, height: 200 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = base[0];
    png.data[i + 1] = base[1];
    png.data[i + 2] = base[2];
    png.data[i + 3] = 255;
  }
  if (paint !== undefined) {
    for (let y = 50; y < 50 + paint.height; y += 1) {
      for (let x = 0; x < paint.width; x += 1) {
        const index = (100 * y + x) << 2;
        png.data[index] = paint.colour[0];
        png.data[index + 1] = paint.colour[1];
        png.data[index + 2] = paint.colour[2];
      }
    }
  }
  return PNG.sync.write(png);
}

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

describe('[SPEC-3002] comparaison visuelle par flux', () => {
  it('donne un ratio par flux, et 0 pour une capture comparée à elle-même', () => {
    const reference = image(WHITE);
    const captures = [
      image(WHITE, { width: 5, height: 100, colour: BLACK }), // 2,5 % de pixels différents
      image(WHITE, { width: 10, height: 100, colour: BLACK }), // 5 %
      image(WHITE, { width: 20, height: 100, colour: BLACK }), // 10 %
    ];
    const ratios = captures.map((capture) => compareImages(capture, reference).diffRatio);
    expect(new Set(ratios.map((ratio) => ratio.toFixed(3))).size).toBe(3);
    expect(compareImages(reference, reference).diffRatio).toBe(0);
    expect(compareImages(reference, reference).ok).toBe(true);
  });
});
