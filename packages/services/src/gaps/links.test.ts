import { describe, expect, it } from 'vitest';

import type { GapNature } from '@learny/learning-engine';

import { courseTarget, trainingTarget } from './links';

const FORMATION = '11111111-1111-4111-8111-111111111111';
const MODULE = '22222222-2222-4222-8222-222222222222';
const NOTION = '33333333-3333-4333-8333-333333333333';
const CHAPTER = '44444444-4444-4444-8444-444444444444';

function target(nature: GapNature) {
  return trainingTarget({ formationId: FORMATION, moduleId: MODULE, notionId: NOTION, nature });
}

describe('[SPEC-615] liens des cartes de lacune', () => {
  it('ouvre le quiz global ciblé pour oubli, confusion et incompréhension (EF-3, ET-4)', () => {
    for (const nature of ['forgetting', 'confusion', 'misunderstanding'] as const) {
      expect(target(nature)).toEqual({
        kind: 'quiz',
        href: `/formations/${FORMATION}/quiz-global?cible=${NOTION}`,
      });
    }
  });

  it('ouvre un exercice pratique pour une difficulté d’application (EF-3, ET-4)', () => {
    expect(target('application')).toEqual({
      kind: 'exercise',
      href: `/formations/${FORMATION}/modules/${MODULE}/exercices?notion=${NOTION}`,
    });
  });

  it('construit une ancre de cours valide avec le chapitre et la section (ET-5)', () => {
    expect(
      courseTarget({
        formationId: FORMATION,
        moduleId: MODULE,
        chapterId: CHAPTER,
        section: { sectionId: 'section-1', anchor: 'cle-de-comptabilisation' },
      }),
    ).toEqual({
      sectionId: 'section-1',
      anchor: 'cle-de-comptabilisation',
      href: `/formations/${FORMATION}/modules/${MODULE}/cours?chapitre=${CHAPTER}#cle-de-comptabilisation`,
    });
  });

  it('n’expose aucune ancre quand la source est supprimée ou vide (ET-5)', () => {
    expect(
      courseTarget({
        formationId: FORMATION,
        moduleId: MODULE,
        chapterId: CHAPTER,
        section: null,
      }),
    ).toBeNull();
    expect(
      courseTarget({
        formationId: FORMATION,
        moduleId: MODULE,
        chapterId: CHAPTER,
        section: { sectionId: 'section-1', anchor: '   ' },
      }),
    ).toBeNull();
  });
});
