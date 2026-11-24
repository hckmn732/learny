import { describe, expect, it } from 'vitest';

import { ProgrammeDraftSchema, ProgrammeProposalPayloadSchema } from './programme';

/**
 * [SPEC-605] The stored proposal and the tutor draft: positions, ordering and unique notions.
 * The rules of BR-FOR-04 to BR-FOR-06 are pure, so they are pinned here rather than in the service.
 */
function moduleAt(position: number, chapterPositions: number[] = [1]) {
  return {
    position,
    title: `Module ${String(position)}`,
    objectives: ['Comprendre'],
    plannedStart: '2026-11-16',
    plannedEnd: '2026-12-01',
    threshold: 80,
    chapters: chapterPositions.map((chapterPosition) => ({
      position: chapterPosition,
      title: `Chapitre ${String(chapterPosition)}`,
      notions: [{ label: 'Intégrales', definition: 'Somme continue' }],
    })),
  };
}

describe('[SPEC-605] ProgrammeProposalPayloadSchema', () => {
  it('accepte une proposition ordonnée', () => {
    const parsed = ProgrammeProposalPayloadSchema.safeParse({
      description: null,
      volumeHours: 20,
      summary: null,
      modules: [moduleAt(1), moduleAt(2)],
    });
    expect(parsed.success).toBe(true);
  });

  it('refuse deux modules à la même position', () => {
    const parsed = ProgrammeProposalPayloadSchema.safeParse({
      modules: [moduleAt(1), moduleAt(1)],
    });
    expect(parsed.success).toBe(false);
  });

  it('refuse deux chapitres à la même position', () => {
    const parsed = ProgrammeProposalPayloadSchema.safeParse({ modules: [moduleAt(1, [1, 1])] });
    expect(parsed.success).toBe(false);
  });

  it('refuse une notion répétée dans un chapitre, accents et casse ignorés', () => {
    const module = moduleAt(1);
    const chapter = module.chapters[0];
    if (chapter === undefined) throw new Error('chapitre attendu');
    module.chapters[0] = {
      ...chapter,
      notions: [
        { label: 'Intégrales', definition: 'A' },
        { label: 'integrales', definition: 'B' },
      ],
    };
    expect(ProgrammeProposalPayloadSchema.safeParse({ modules: [module] }).success).toBe(false);
  });
});

describe('[SPEC-605] ProgrammeDraftSchema', () => {
  it('accepte un brouillon sans position et applique le seuil par défaut', () => {
    const parsed = ProgrammeDraftSchema.safeParse({
      modules: [
        {
          title: 'Module',
          objectives: ['Comprendre'],
          plannedStart: '2026-11-16',
          plannedEnd: '2026-12-01',
          chapters: [
            { title: 'Chapitre', notions: [{ label: 'Intégrales', definition: 'Somme continue' }] },
          ],
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.modules[0]?.threshold).toBe(80);
  });

  it('refuse un brouillon dont un chapitre n’a aucune notion', () => {
    const parsed = ProgrammeDraftSchema.safeParse({
      modules: [
        {
          title: 'Module',
          objectives: ['Comprendre'],
          plannedStart: '2026-11-16',
          plannedEnd: '2026-12-01',
          chapters: [{ title: 'Chapitre', notions: [] }],
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});
