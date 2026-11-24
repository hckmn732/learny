import { describe, expect, it } from 'vitest';

import type { ProgrammeModuleDto, SimpleGenerationModule, SimpleSource } from '@learny/contracts';

import {
  analysisProgress,
  businessDaysBetween,
  chapterMinutes,
  civilDateOf,
  deadlineEndDate,
  errorMessage,
  exerciseCount,
  formatHours,
  hasReadyCourseFile,
  moduleMinutes,
  proposalEndDate,
  readyChapter,
  sourceSummary,
  studyIndicators,
  visibleModules,
} from './simple-mode';

const TODAY = '2026-11-11';

function module(position: number, plannedEnd: string, chapters = 2): ProgrammeModuleDto {
  return {
    position,
    title: `Module ${String(position)}`,
    objectives: ['Comprendre'],
    plannedStart: '2026-11-12',
    plannedEnd,
    threshold: 80,
    chapters: Array.from({ length: chapters }, (_value, index) => ({
      position: index + 1,
      title: `Chapitre ${String(index + 1)}`,
      notions: [{ label: 'Notion', definition: 'Définition' }],
      pageFrom: 1,
      pageTo: 10,
    })),
    pageFrom: 1,
    pageTo: 48,
    status: null,
  };
}

describe('[SPEC-4002] indicateurs de l’aperçu', () => {
  it('CA-3 — une échéance plus lointaine baisse le rythme quotidien', () => {
    const near = studyIndicators({ volumeHours: 112, endDate: '2027-01-15', today: TODAY });
    const far = studyIndicators({ volumeHours: 112, endDate: '2027-06-01', today: TODAY });
    expect(near.perDayMinutes).toBeGreaterThan(far.perDayMinutes);
    expect(far.studyHours).toBe('112 h');
    expect(far.endDate).toBe('2027-06-01');
    expect(near.endDate).toBe('2027-01-15');
  });

  it('CA-3 — la fin prévue suit le dernier module planifié', () => {
    expect(proposalEndDate([module(1, '2027-01-15'), module(2, '2027-03-03')])).toBe('2027-03-03');
    expect(proposalEndDate([])).toBeNull();
  });

  it('formate les heures comme la maquette', () => {
    expect(formatHours(120)).toBe('2 h');
    expect(formatHours(140)).toBe('2 h 20');
    expect(formatHours(45)).toBe('45 min');
    expect(formatHours(0)).toBe('0 min');
  });

  it('compte les jours ouvrés, bornes comprises', () => {
    // Du mercredi 11 au vendredi 13 novembre 2026 : trois jours ouvrés.
    expect(businessDaysBetween('2026-11-11', '2026-11-13')).toBe(3);
    // Un samedi et un dimanche ne comptent pas.
    expect(businessDaysBetween('2026-11-14', '2026-11-15')).toBe(0);
    expect(businessDaysBetween('2026-11-15', '2026-11-11')).toBe(0);
  });

  it('EF-8 — une échéance finit quatorze jours avant, jamais avant aujourd’hui', () => {
    expect(deadlineEndDate('2027-06-15', TODAY)).toBe('2027-06-01');
    // 24 novembre - 14 jours = 10 novembre : la fin planifiée ne remonte jamais avant aujourd'hui.
    expect(deadlineEndDate('2026-11-24', TODAY)).toBe(TODAY);
    expect(deadlineEndDate('2026-11-25', TODAY)).toBe('2026-11-11');
  });

  it('lit le jour courant depuis l’horloge injectable', () => {
    expect(civilDateOf(new Date('2026-11-11T12:20:00Z'))).toBe('2026-11-11');
  });
});

describe('[SPEC-4002] durées du premier chapitre', () => {
  it('répartit les heures du programme sur les chapitres du module', () => {
    expect(moduleMinutes(112, 2, 14)).toBe(960);
    expect(moduleMinutes(null, 2, 14)).toBe(0);
    expect(moduleMinutes(112, 2, 0)).toBe(0);
  });

  it('borne la séance d’un chapitre entre 20 et 45 minutes (ADR-4003 D7)', () => {
    expect(chapterMinutes(960, 2)).toBe(45);
    expect(chapterMinutes(20, 3)).toBe(20);
    expect(chapterMinutes(120, 4)).toBe(30);
    expect(chapterMinutes(120, 0)).toBe(20);
  });

  it('annonce au moins un exercice par chapitre', () => {
    expect(exerciseCount(0)).toBe(1);
    expect(exerciseCount(3)).toBe(3);
  });

  it('EF-7 — choisit le premier module prêt, sinon en préparation, sinon en file', () => {
    const generation: SimpleGenerationModule[] = [
      { moduleId: 'a', position: 1, title: 'Module 1', state: 'acquired' },
      { moduleId: 'b', position: 2, title: 'Module 2', state: 'generating' },
      { moduleId: 'c', position: 3, title: 'Module 3', state: 'ready' },
    ];
    const modules = [module(1, '2026-11-20'), module(2, '2026-11-30'), module(3, '2026-12-10')];
    const ready = readyChapter(generation, modules, 60);
    expect(ready?.module.position).toBe(3);
    expect(ready?.chapterPosition).toBe(1);
    expect(ready?.pages).toEqual({ from: 1, to: 48 });
    expect(readyChapter([], modules, 60)).toBeNull();
    expect(
      readyChapter(
        [{ moduleId: 'd', position: 9, title: 'Module 9', state: 'queued' }],
        modules,
        60,
      )?.chapterTitle,
    ).toBe('Module 9');
  });
});

describe('[SPEC-4002] liste des documents', () => {
  it('EF-2 — « Créer ma formation » exige un document de rôle « Cours » prêt', () => {
    expect(hasReadyCourseFile([], [])).toBe(false);
    expect(hasReadyCourseFile([{ role: 'course', status: 'uploading' }], [])).toBe(false);
    expect(hasReadyCourseFile([{ role: 'exercises', status: 'ready' }], [])).toBe(false);
    expect(hasReadyCourseFile([{ role: 'course', status: 'ready' }], [])).toBe(true);
    const source: SimpleSource = {
      resourceId: '00000000-0000-4000-8000-000000000001',
      title: 'Manuel',
      kind: 'pdf',
      role: 'course',
      pages: 712,
      status: 'processing',
    };
    expect(hasReadyCourseFile([], [source])).toBe(true);
  });

  it('EF-5 — la ligne « D’après … » nomme le manuel, les TD et les annales', () => {
    const sources: SimpleSource[] = [
      {
        resourceId: '00000000-0000-4000-8000-000000000001',
        title: 'Manuel de comptabilité générale',
        kind: 'pdf',
        role: 'course',
        pages: 712,
        status: 'ready',
      },
      {
        resourceId: '00000000-0000-4000-8000-000000000002',
        title: 'TD corrigés',
        kind: 'pdf',
        role: 'exercises',
        pages: 96,
        status: 'ready',
      },
      {
        resourceId: '00000000-0000-4000-8000-000000000003',
        title: 'Annales',
        kind: 'pdf',
        role: 'exam_papers',
        pages: 54,
        status: 'ready',
      },
    ];
    const summary = sourceSummary(sources);
    expect(summary.pages).toBe(712);
    expect(summary.sentence).toContain('« Manuel de comptabilité générale » (712 p.)');
    expect(summary.sentence).toContain('tes TD corrigés');
    expect(summary.sentence).toContain('1 session d’annales');
    expect(sourceSummary([]).sentence).toBe('');
  });

  it('EF-5 — six modules au plus dans la liste, le reste est résumé', () => {
    const modules = Array.from({ length: 14 }, (_value, index) => module(index + 1, '2027-01-15'));
    const { visible, hidden } = visibleModules(modules);
    expect(visible).toHaveLength(6);
    expect(hidden).toHaveLength(8);
  });
});

describe('[SPEC-4002] analyse et erreurs', () => {
  it('EF-4 — la progression suit les étapes terminées', () => {
    expect(analysisProgress([])).toBe(0);
    expect(
      analysisProgress([
        { state: 'done' },
        { state: 'done' },
        { state: 'running' },
        { state: 'todo' },
      ]),
    ).toBe(50);
    expect(analysisProgress([{ state: 'done' }, { state: 'done' }])).toBe(100);
  });

  it('affiche le message de l’API, sinon le libellé générique', () => {
    expect(errorMessage(new Error('Dix documents au plus.'), 'Générique')).toBe(
      'Dix documents au plus.',
    );
    expect(errorMessage(new Error('   '), 'Générique')).toBe('Générique');
    expect(errorMessage('texte', 'Générique')).toBe('Générique');
  });
});
