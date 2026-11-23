// Fixtures of SPEC-3202: the demonstration dataset of 11 November 2026 (SPEC-115) reduced to the
// Programme tab — SAP S/4HANA Finance at 38 %, module 3 open, module 2 validated, module 4 locked,
// chapter 2 in course at 45 % (8 minutes left). Shared by Vitest and Jest, never shipped.
import type {
  ActiveProgrammeDto,
  ModuleCourseScreen,
  ProgrammeScreenStateDto,
  SidebarDto,
} from '@learny/contracts';

export const FORMATION_ID = '00000000-0000-4000-8000-000000000001';
export const TODAY = '2026-11-11';

const MODULE_POSITIONS = [1, 2, 3, 4, 5, 6, 7] as const;
const TITLES: Record<number, string> = {
  1: 'Fondamentaux de SAP S/4HANA',
  2: 'Comptabilité fournisseurs',
  3: 'Comptabilité générale',
  4: 'Clôtures et reporting',
  5: 'Comptabilité clients',
  6: 'Immobilisations',
  7: 'Certification',
};

const STARTS: Record<number, string> = {
  1: '2026-11-02',
  2: '2026-11-05',
  3: '2026-11-09',
  4: '2026-11-16',
  5: '2026-11-23',
  6: '2026-11-30',
  7: '2026-12-07',
};

const ENDS: Record<number, string> = {
  1: '2026-11-04',
  2: '2026-11-06',
  3: '2026-11-13',
  4: '2026-11-20',
  5: '2026-11-27',
  6: '2026-12-04',
  7: '2026-12-11',
};

function idOf(position: number, suffix = ''): string {
  return `00000000-0000-4000-8000-0000000000${String(position).padStart(2, '0')}${suffix}`;
}

const CHAPTER_TITLES = [
  'Plan comptable et comptes généraux',
  'Saisie des pièces comptables',
  'Journal universel (ACDOCA)',
  'Ledgers parallèles',
] as const;

export function activeProgramme(): ActiveProgrammeDto {
  const modules = MODULE_POSITIONS.map((position) => ({
    id: idOf(position),
    position,
    title: TITLES[position] ?? '',
    objectives: ['objectif'],
    plannedStart: STARTS[position] ?? '2026-11-02',
    plannedEnd: ENDS[position] ?? '2026-12-11',
    threshold: 80,
    status:
      position <= 2
        ? ('validated' as const)
        : position === 3
          ? ('open' as const)
          : ('locked' as const),
    score: position === 1 ? 86 : position === 2 ? 91 : null,
    quizOn: ENDS[position] ?? '2026-12-11',
    quizKind: position === 7 ? ('exam' as const) : ('quiz' as const),
    unlockAfterPosition: position > 3 ? position - 1 : null,
    href: position > 3 ? null : `/formations/${FORMATION_ID}/modules/${idOf(position)}`,
  }));
  const chapters = MODULE_POSITIONS.flatMap((position) => {
    const count = position === 3 ? 4 : position === 4 ? 5 : 3;
    return Array.from({ length: count }, (_, index) => ({
      id: idOf(position, String(index + 1).padStart(2, '0')),
      moduleId: idOf(position),
      position: index + 1,
      title:
        position === 3
          ? (CHAPTER_TITLES[index] ?? '')
          : `Chapitre ${String(index + 1)} du module ${String(position)}`,
      contributionsStatus: 'done' as const,
      courseHref: `/formations/${FORMATION_ID}/modules/${idOf(position)}/cours?chapitre=${idOf(position, String(index + 1).padStart(2, '0'))}`,
    }));
  });
  return {
    formation: {
      id: FORMATION_ID,
      title: 'SAP S/4HANA Finance',
      description: 'Devenir opérationnel sur les processus financiers.',
      objectives: ['operationnel', 'exam'],
      volumeHours: 150,
      startDate: STARTS[1] ?? null,
      endDate: ENDS[7] ?? null,
      threshold: 80,
      status: 'active',
    },
    indicators: {
      progress: { validated: 2, total: 7, percent: 38 },
      weeks: 6,
      volumeHours: 150,
      threshold: 80,
      hoursPerDay: 5,
      studyDaysPerWeek: 5,
    },
    modules,
    chapters,
    calendar: modules.map((module) => ({
      moduleId: module.id,
      position: module.position,
      title: module.title,
      start: module.plannedStart,
      end: module.plannedEnd,
      status: module.status,
      quizOn: module.quizOn,
      quizKind: module.quizKind,
    })),
    today: TODAY,
    timeZone: 'Europe/Paris',
  };
}

export function courseScreen(): ModuleCourseScreen {
  const percentages = [100, 45, 0, 0];
  return {
    formation: { id: FORMATION_ID, title: 'SAP S/4HANA Finance' },
    module: { id: idOf(3), position: 3, positionTotal: 7, title: 'Comptabilité générale' },
    chapters: CHAPTER_TITLES.map((title, index) => ({
      id: idOf(3, String(index + 1).padStart(2, '0')),
      position: index + 1,
      title,
      hasCourse: true,
      percent: percentages[index] ?? 0,
    })),
    selectedChapterId: idOf(3, '02'),
    course: {
      id: '00000000-0000-4000-8000-0000000000c1',
      version: 1,
      status: 'ready',
      generatedAt: '2026-11-09T10:00:00.000Z',
      model: 'modele-demo',
      readingMinutes: 14,
      resourceCount: 4,
      baseCourse: false,
      chapter: {
        id: idOf(3, '02'),
        position: 2,
        title: 'Saisie des pièces comptables',
        hasCourse: true,
        percent: 45,
      },
      previousChapterId: idOf(3, '01'),
      nextChapterId: idOf(3, '03'),
      sections: [],
      suggestions: [],
      tutorStarters: [],
      tutorGap: null,
      progress: { chapterPercent: 45, coursePercent: 60, updatedAt: '2026-11-11T12:00:00.000Z' },
      summary: null,
      quiz: { threshold: 80, href: `/formations/${FORMATION_ID}/modules/${idOf(3)}/quiz` },
    },
    generation: { status: 'ready', version: 1, error: null },
  };
}

/** Reading progress fed to the read model (the shape of ET-1's course read). */
export function courseProgress() {
  const screen = courseScreen();
  return {
    chapters: screen.chapters,
    selectedChapterId: screen.course?.chapter.id ?? screen.selectedChapterId,
    readingMinutes: screen.course?.readingMinutes ?? 1,
  };
}

export function programmeState(): ProgrammeScreenStateDto {
  return activeProgramme();
}

export function sidebar(): SidebarDto {
  return {
    collapsed: false,
    currentFormation: {
      id: FORMATION_ID,
      title: 'SAP S/4HANA Finance',
      monogram: 'SAP',
      accent: 'indigo',
      status: 'active',
      progressPercent: 38,
      currentModulePosition: 3,
      moduleCount: 7,
    },
    quizDueCount: 14,
    gapCount: 4,
    streak: { days: 12, regularity: [] },
    formations: [
      {
        id: FORMATION_ID,
        title: 'SAP S/4HANA Finance',
        monogram: 'SAP',
        accent: 'indigo',
        status: 'active',
        progressPercent: 38,
        currentModulePosition: 3,
        moduleCount: 7,
      },
      {
        id: '00000000-0000-4000-8000-0000000000f2',
        title: 'Scrum Product Owner',
        monogram: 'SPO',
        accent: 'green',
        status: 'paused',
        progressPercent: 62,
        currentModulePosition: 2,
        moduleCount: 5,
      },
    ],
  };
}

export function me() {
  return {
    id: '00000000-0000-4000-8000-0000000000aa',
    email: 'alex.perrin@demo.learny.test',
    firstName: 'Alex',
    lastName: 'Perrin',
    tutorTone: 'vouvoiement' as const,
    courseLanguage: 'fr' as const,
    timezone: 'Europe/Paris',
    onboardingStep: 'done' as const,
    onboardingCompletedAt: '2026-11-01T10:00:00.000Z',
    currentFormationId: FORMATION_ID,
  };
}

export function moduleFixture(): ActiveProgrammeDto['modules'][number] {
  const model = activeProgramme();
  const module = model.modules[2];
  if (module === undefined) throw new Error('module 3 absent des fixtures');
  return module;
}
