import { describe, expect, it } from 'vitest';

import {
  ProgrammeDraftSchema,
  ProgrammeProposalPayloadSchema,
  type ProgrammeDraft,
  type ProgrammeProposalPayload,
} from '@learny/contracts';

import { normalizeDraft, parseProposalPayload } from './rules';

const NOTION = { label: 'Notion A', definition: 'Définition courte A.' };

function draft(overrides: Partial<ProgrammeDraft> = {}): ProgrammeDraft {
  return {
    description: 'Formation de test.',
    volumeHours: 10,
    summary: 'Deux modules.',
    modules: [
      {
        title: 'Module 1',
        objectives: ['Objectif 1'],
        plannedStart: '2026-11-02',
        plannedEnd: '2026-11-06',
        threshold: 80,
        chapters: [{ title: 'Chapitre 1', notions: [NOTION] }],
      },
      {
        title: 'Module 2',
        objectives: ['Objectif 2'],
        plannedStart: '2026-11-09',
        plannedEnd: '2026-11-13',
        threshold: 80,
        chapters: [{ title: 'Chapitre 2', notions: [NOTION] }],
      },
    ],
    ...overrides,
  };
}

function payload(): ProgrammeProposalPayload {
  return normalizeDraft(draft());
}

describe('[SPEC-605] seuils et structure', () => {
  it('CA-2 — refuse 59 % et 96 %, accepte 60 % et 95 %', () => {
    for (const threshold of [59, 96]) {
      const parsed = ProgrammeDraftSchema.safeParse({
        ...draft(),
        modules: [{ ...draft().modules[0], threshold }],
      });
      expect(parsed.success, String(threshold)).toBe(false);
    }
    for (const threshold of [60, 95]) {
      const parsed = ProgrammeDraftSchema.safeParse({
        ...draft(),
        modules: [{ ...draft().modules[0], threshold }],
      });
      expect(parsed.success, String(threshold)).toBe(true);
    }
  });

  it('CA-2 — un seuil omis devient 80 %', () => {
    const first = draft().modules[0];
    if (first === undefined) throw new Error('module absent');
    const withoutThreshold: Record<string, unknown> = { ...first };
    delete withoutThreshold.threshold;
    const parsed = ProgrammeDraftSchema.parse({
      ...draft(),
      modules: [withoutThreshold],
    });
    expect(parsed.modules[0]?.threshold).toBe(80);
  });

  it('numérote les modules, chapitres et notions dans l’ordre', () => {
    const normalized = normalizeDraft(draft());
    expect(normalized.modules.map((module) => module.position)).toEqual([1, 2]);
    expect(normalized.modules[0]?.chapters[0]?.position).toBe(1);
  });

  it('refuse deux modules à la même position', () => {
    const value = payload();
    const second = value.modules[1];
    if (second === undefined) throw new Error('module absent');
    value.modules[1] = { ...second, position: 1 };
    expect(ProgrammeProposalPayloadSchema.safeParse(value).success).toBe(false);
  });

  it('refuse deux chapitres à la même position dans un module', () => {
    const value = payload();
    const module = value.modules[0];
    const chapter = module?.chapters[0];
    if (module === undefined || chapter === undefined) throw new Error('chapitre absent');
    module.chapters.push({ ...chapter, title: 'Doublon' });
    const parsed = ProgrammeProposalPayloadSchema.safeParse(value);
    expect(parsed.success).toBe(false);
  });

  it('refuse une notion dupliquée dans un même chapitre (accents et casse)', () => {
    const value = payload();
    const chapter = value.modules[0]?.chapters[0];
    if (chapter === undefined) throw new Error('chapitre absent');
    chapter.notions.push({ label: '  NOTION A ', definition: 'Autre définition.' });
    const parsed = ProgrammeProposalPayloadSchema.safeParse(value);
    expect(parsed.success).toBe(false);
  });

  it('refuse un module sans chapitre et un chapitre sans notion', () => {
    const emptyChapters = {
      ...draft(),
      modules: [{ ...draft().modules[0], chapters: [] }],
    };
    expect(ProgrammeDraftSchema.safeParse(emptyChapters).success).toBe(false);
    const emptyNotions = {
      ...draft(),
      modules: [
        {
          ...draft().modules[0],
          chapters: [{ title: 'Chapitre vide', notions: [] }],
        },
      ],
    };
    expect(ProgrammeDraftSchema.safeParse(emptyNotions).success).toBe(false);
  });

  it('refuse des dates inversées et des modules hors ordre chronologique', () => {
    const inverted = {
      ...draft(),
      modules: [
        {
          ...draft().modules[0],
          plannedStart: '2026-11-10',
          plannedEnd: '2026-11-01',
        },
      ],
    };
    expect(ProgrammeDraftSchema.safeParse(inverted).success).toBe(false);

    const unordered = {
      ...draft(),
      modules: [draft().modules[1], draft().modules[0]],
    };
    expect(ProgrammeDraftSchema.safeParse(unordered).success).toBe(false);
  });

  it('rejette une charge stockée obsolète ou corrompue', () => {
    expect(() => parseProposalPayload({ modules: [] })).toThrow(/incomplet/);
    expect(parseProposalPayload(payload()).modules).toHaveLength(2);
  });
});
