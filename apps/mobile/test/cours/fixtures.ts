// Fixtures of SPEC-3302: the course of module 3 of the demonstration dataset (SPEC-115), reduced to
// what the reading screen renders - chapter 2 of 4 « Saisie des pièces comptables », already read at
// 100 %, with a verified citation, a flash question, a « Ne pas confondre » block and « À retenir ».
// Never shipped: the screens read the API.
import type {
  CourseCitation,
  CourseSection,
  ModuleCourseScreen,
  CourseView,
} from '@learny/contracts';

export const FORMATION_ID = '00000000-0000-4000-8000-000000000001';
export const MODULE_ID = '00000000-0000-4000-8000-000000000003';
export const COURSE_ID = '00000000-0000-4000-8000-0000000000c3';
export const CITATION_ID = '00000000-0000-4000-8000-0000000000c4';
export const SUMMARY_ID = '00000000-0000-4000-8000-0000000000c5';

/** Identifiers of the sections of chapter 2, as the demonstration seed numbers them. */
export const TEXT_SECTION_ID = '00000000-0000-4000-8000-000000000031';
export const FLASH_SECTION_ID = '00000000-0000-4000-8000-000000000032';
export const COMPARISON_SECTION_ID = '00000000-0000-4000-8000-000000000033';
export const RETAIN_SECTION_ID = '00000000-0000-4000-8000-000000000034';
export const SUMMARY_SECTION_ID = '00000000-0000-4000-8000-000000000035';

export const CHAPTER_TITLES = [
  'Plan comptable et comptes généraux',
  'Saisie des pièces comptables',
  'Journal universel (ACDOCA)',
  'Ledgers parallèles',
] as const;

/** Chapter identifier, 1-based: the demonstration seed numbers them like the mockup. */
export function chapterId(position: number): string {
  return `00000000-0000-4000-8000-000000000003${String(position).padStart(2, '0')}`;
}

export function sectionId(anchor: string): string {
  return `00000000-0000-4000-8000-0000000000${anchor.slice(-2).padStart(2, '0')}`;
}

const CITATION: CourseCitation = {
  id: CITATION_ID,
  chunkId: '00000000-0000-4000-8000-0000000000d1',
  resourceId: '00000000-0000-4000-8000-0000000000d2',
  label: 'Vos notes · module 3',
  quote: 'Journal universel, ledgers parallèles et ledger principal 0L.',
  location: { page: 12 },
  mediaKind: 'note',
  deleted: false,
};

function textSection(): CourseSection {
  return {
    id: TEXT_SECTION_ID,
    kind: 'text',
    anchor: 'chapitre-2-text',
    title: 'Présentation',
    contentMd:
      'Une pièce se saisit en deux temps : l’en-tête, puis les postes. Cet ordre détermine ce que le tuteur pourra vérifier ensuite.',
    data: null,
    origin: 'tutor',
    notionIds: [],
    citations: [],
    version: 1,
    reported: false,
  };
}

function flashSection(): CourseSection {
  return {
    id: FLASH_SECTION_ID,
    kind: 'flash_question',
    anchor: 'chapitre-2-flash-question',
    title: 'Question éclair',
    contentMd: null,
    data: {
      question: 'Quelle clé de comptabilisation utilise-t-on pour un compte général ?',
      answer: '40 au débit et 50 au crédit.',
    },
    origin: 'tutor',
    notionIds: [],
    citations: [CITATION],
    version: 1,
    reported: false,
  };
}

function comparisonSection(): CourseSection {
  return {
    id: COMPARISON_SECTION_ID,
    kind: 'dont_confuse',
    anchor: 'chapitre-2-dont-confuse',
    title: 'Ne pas confondre',
    contentMd: null,
    data: {
      left: {
        title: 'Clé de comptabilisation',
        body: 'Code à deux chiffres porté par chaque poste.',
        example: '40 / 50',
      },
      right: {
        title: 'Type de pièce',
        body: 'Classe toute la pièce et fixe sa numérotation.',
        example: 'SA, KR, DR',
      },
    },
    origin: 'tutor',
    notionIds: [],
    citations: [],
    version: 1,
    reported: false,
  };
}

function retainSection(): CourseSection {
  return {
    id: RETAIN_SECTION_ID,
    kind: 'retain',
    anchor: 'chapitre-2-retain',
    title: 'À retenir',
    contentMd: null,
    data: {
      points: [
        'Une pièce est équilibrée : débits = crédits.',
        'La clé de comptabilisation appartient au poste, le type à l’en-tête.',
      ],
      mnemonic: 'Clé au poste, type à l’en-tête.',
    },
    origin: 'tutor',
    notionIds: [],
    citations: [],
    version: 1,
    reported: false,
  };
}

function summarySection(): CourseSection {
  return {
    id: SUMMARY_SECTION_ID,
    kind: 'summary_prompt',
    anchor: 'chapitre-2-summary-prompt',
    title: 'Résumez le chapitre',
    contentMd: 'Expliquez la différence entre ledgers parallèles et ledger principal.',
    data: null,
    origin: 'tutor',
    notionIds: [],
    citations: [],
    version: 1,
    reported: false,
  };
}

export interface CourseOptions {
  /** Adds the `summary_prompt` section of the last chapter (BR-COU-07). */
  readonly withSummary?: boolean;
  /** Chapter shown by the screen, 1-based; 2 by default. */
  readonly chapter?: number;
  /** Version of the course, changed by the CL-2 test. */
  readonly version?: number;
  /** Persisted percentage of the selected chapter. */
  readonly percent?: number;
}

/** One chapter selected, as `GET /modules/:mid/course?chapitre=` returns it (SPEC-608). */
export function courseScreen(options: CourseOptions = {}): ModuleCourseScreen {
  const position = options.chapter ?? 2;
  const sections: CourseSection[] = [
    textSection(),
    flashSection(),
    comparisonSection(),
    retainSection(),
  ];
  if (options.withSummary === true) sections.push(summarySection());
  const course: CourseView = {
    id: COURSE_ID,
    version: options.version ?? 1,
    status: 'ready',
    generatedAt: '2026-11-09T11:00:00Z',
    model: 'modele-demo-a',
    readingMinutes: 8,
    resourceCount: 4,
    baseCourse: false,
    chapter: {
      id: chapterId(position),
      position,
      title: CHAPTER_TITLES[position - 1] ?? '',
      hasCourse: true,
      percent: options.percent ?? 100,
    },
    previousChapterId: position > 1 ? chapterId(position - 1) : null,
    nextChapterId: position < CHAPTER_TITLES.length ? chapterId(position + 1) : null,
    sections,
    suggestions: [],
    tutorStarters: [],
    tutorGap: null,
    progress: { chapterPercent: options.percent ?? 100, coursePercent: 68, updatedAt: null },
    summary: null,
    quiz: { threshold: 80, href: `/formations/${FORMATION_ID}/modules/${MODULE_ID}` },
  };
  return {
    formation: { id: FORMATION_ID, title: 'SAP S/4HANA Finance' },
    module: {
      id: MODULE_ID,
      position: 3,
      positionTotal: 7,
      title: 'Comptabilité générale',
    },
    chapters: CHAPTER_TITLES.map((title, index) => ({
      id: chapterId(index + 1),
      position: index + 1,
      title,
      hasCourse: true,
      percent: index === position - 1 ? (options.percent ?? 100) : 0,
    })),
    selectedChapterId: chapterId(position),
    course,
    generation: { status: 'ready', version: 1, error: null },
  };
}

/** A course not generated yet (EF-7). */
export function pendingCourseScreen(): ModuleCourseScreen {
  const screen = courseScreen();
  return {
    ...screen,
    course: null,
    generation: { status: 'none', version: null, error: null },
  };
}

export { CITATION, COURSE_ID as COURSE };
