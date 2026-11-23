// Vitest [SPEC-3302] — sections visibles du chapitre (ET-2, BR-COU-08).
//
// The rule is pure: the test drives the scroll offset and the viewport of a 412 × 915 screen.
import { describe, expect, it } from 'vitest';

import { VISIBLE_RATIO, visibleSections, type SectionBox } from './viewport';

// The header of the article is a `ListHeaderComponent`, never a measured section: the boxes only
// carry the sections of the chapter, offsets included in the content of the list.
const BOXES: readonly SectionBox[] = [
  { id: 's1', y: 300, height: 400 },
  { id: 's2', y: 700, height: 400 },
  { id: 's3', y: 1_100, height: 400 },
];

describe('[SPEC-3302] sections visibles', () => {
  it('ne retient que les sections assez visibles dans la fenêtre (ET-2)', () => {
    // s1 is entirely visible, s2 is more than a third visible (215 of 400 points), s3 is not
    // visible at all: a section counts from 35 % of the smaller of the two surfaces.
    expect(visibleSections(BOXES, 0, 915)).toEqual(['s1', 's2']);
    expect(VISIBLE_RATIO).toBe(0.35);
    // A section that only peeks at the bottom of the screen is not read yet.
    expect(visibleSections(BOXES, 0, 740)).toEqual(['s1']);
    expect(visibleSections(BOXES, 0, 100)).toEqual([]);
  });

  it('compte une section plus haute que l’écran dès que l’écran est rempli (ET-2)', () => {
    const tall: readonly SectionBox[] = [{ id: 'long', y: 0, height: 4_000 }];
    expect(visibleSections(tall, 0, 900)).toEqual(['long']);
    expect(visibleSections(tall, 400, 900)).toEqual(['long']);
  });

  it('ignore une fenêtre ou une section de hauteur nulle', () => {
    expect(visibleSections(BOXES, 0, 0)).toEqual([]);
    expect(visibleSections([{ id: 'vide', y: 0, height: 0 }], 0, 900)).toEqual([]);
  });

  it('ne renvoie jamais une section avant son défilement', () => {
    expect(visibleSections(BOXES, 0, 915)).not.toContain('s3');
    expect(visibleSections(BOXES, 1_100, 915)).toContain('s3');
  });
});
