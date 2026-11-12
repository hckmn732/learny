import { ENGINE } from '@learny/config/product';
import { buildDailySession } from '@learny/learning-engine';
import type {
  DailySession,
  GlobalQuizBank,
  GlobalQuizDueNotion,
  GlobalQuizGap,
  GlobalQuizLastFormat,
  GlobalQuizMode,
} from '@learny/learning-engine';

/** Frozen demonstration inputs (ADR-0047); no database write and no clock read. */
export const SESSION_DATE = '2026-11-11';
export const SESSION_SEED = 'spec-406-demo';
export const SESSION_FORMATION = 'sap';
export const SESSION_NOW = '2026-11-11T12:20:00.000Z';
export const SESSION_CAP_MINUTES = 10;

export interface DemoModule {
  moduleId: string;
  label: string;
  status: 'validated' | 'open';
  position: number;
  evaluated: boolean;
}

export const DEMO_MODULES: readonly DemoModule[] = [
  {
    moduleId: 'sap-m1',
    label: 'Fondamentaux et navigation',
    status: 'validated',
    position: 1,
    evaluated: true,
  },
  {
    moduleId: 'sap-m2',
    label: 'Structure organisationnelle',
    status: 'validated',
    position: 2,
    evaluated: true,
  },
  {
    moduleId: 'sap-m3',
    label: 'Clôture et résultats',
    status: 'open',
    position: 3,
    evaluated: true,
  },
  {
    moduleId: 'sap-m4',
    label: 'Pilotage',
    status: 'open',
    position: 4,
    evaluated: false,
  },
];

export const DEMO_NOTION_LABELS: Readonly<Record<string, string>> = {
  'n-s4': 'SAP S/4HANA',
  'n-fiori': 'SAP Fiori',
  'n-launchpad': 'Launchpad Fiori',
  'n-appli': 'Application Fiori',
  'n-type': 'Type comptable',
  'n-cle': 'Clé de compte',
  'n-societe': 'Société',
  'n-role': 'Rôle utilisateur',
  'n-ledgers': 'Grands livres',
  'n-equilibre': 'Équilibre débit-crédit',
  'n-resultat': 'Compte de résultat',
  'n-cloture': 'Clôture mensuelle',
  'n-sans-banque': 'Notion sans banque',
  'n-notseen': 'Module jamais évalué',
};

export const DEMO_MODULE_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  DEMO_MODULES.map((module) => [module.moduleId, module.label]),
);

function notion(
  notionId: string,
  moduleId: string,
  modulePosition: number,
  overrides: Partial<GlobalQuizDueNotion> = {},
): GlobalQuizDueNotion {
  return {
    notionId,
    moduleId,
    modulePosition,
    moduleStatus: 'validated',
    evaluated: true,
    dueAt: SESSION_NOW,
    ...overrides,
  };
}

export const SESSION_DUE_NOTIONS: readonly GlobalQuizDueNotion[] = [
  notion('n-s4', 'sap-m1', 1),
  notion('n-fiori', 'sap-m1', 1),
  notion('n-launchpad', 'sap-m1', 1),
  notion('n-appli', 'sap-m1', 1),
  notion('n-type', 'sap-m2', 2),
  notion('n-cle', 'sap-m2', 2),
  notion('n-societe', 'sap-m2', 2),
  notion('n-role', 'sap-m2', 2),
  notion('n-ledgers', 'sap-m3', 3, { moduleStatus: 'open' }),
  notion('n-equilibre', 'sap-m3', 3, { moduleStatus: 'open' }),
  notion('n-resultat', 'sap-m3', 3, { moduleStatus: 'open' }),
  notion('n-cloture', 'sap-m3', 3, { moduleStatus: 'open' }),
  notion('n-sans-banque', 'sap-m3', 3, { moduleStatus: 'open' }),
  notion('n-notseen', 'sap-m4', 4, {
    moduleStatus: 'open',
    evaluated: false,
    dueAt: '2026-11-10T12:20:00.000Z',
  }),
];

export const SESSION_GAPS: readonly GlobalQuizGap[] = [
  { notionId: 'n-fiori', nature: 'forgetting' },
  { notionId: 'n-type', nature: 'confusion' },
  { notionId: 'n-ledgers', nature: 'misunderstanding' },
  { notionId: 'n-equilibre', nature: 'application' },
];

export const SESSION_BANK: readonly GlobalQuizBank[] = [
  { notionId: 'n-s4', formats: ['choice_question', 'cloze', 'matching'] },
  { notionId: 'n-fiori', formats: ['choice_question', 'recall_card'] },
  { notionId: 'n-launchpad', formats: ['cloze', 'choice_question'] },
  { notionId: 'n-appli', formats: ['matching', 'categorization'] },
  { notionId: 'n-type', formats: ['matching', 'categorization', 'choice_question'] },
  { notionId: 'n-cle', formats: ['choice_question', 'open_question'] },
  { notionId: 'n-societe', formats: ['recall_card', 'choice_question'] },
  { notionId: 'n-role', formats: ['choice_question'] },
  { notionId: 'n-ledgers', formats: ['cloze', 'open_question'] },
  { notionId: 'n-equilibre', formats: ['open_question', 'choice_question'] },
  { notionId: 'n-resultat', formats: ['choice_question', 'cloze'] },
  { notionId: 'n-cloture', formats: ['ordering', 'matching'] },
  { notionId: 'n-notseen', formats: ['choice_question'] },
];

export const SESSION_LAST_FORMATS: readonly GlobalQuizLastFormat[] = [
  { notionId: 'n-s4', format: 'choice_question' },
  { notionId: 'n-fiori', format: 'choice_question' },
  { notionId: 'n-launchpad', format: 'cloze' },
  { notionId: 'n-appli', format: 'matching' },
  { notionId: 'n-type', format: 'matching' },
  { notionId: 'n-cle', format: 'choice_question' },
  { notionId: 'n-societe', format: 'recall_card' },
  { notionId: 'n-role', format: 'choice_question' },
  { notionId: 'n-ledgers', format: 'cloze' },
  { notionId: 'n-equilibre', format: 'open_question' },
  { notionId: 'n-resultat', format: 'choice_question' },
  { notionId: 'n-cloture', format: 'ordering' },
];

export const SESSION_CAP_BY_MODE: Readonly<Record<GlobalQuizMode, number>> = {
  full: SESSION_CAP_MINUTES,
  micro: ENGINE.globalQuiz.microMinutesDefault,
  maintenance: ENGINE.globalQuiz.maxMinutesDefault,
};

/** Builds the real session shown by the page and asserted by the e2e test. */
export function demoSession(mode: GlobalQuizMode): DailySession {
  return buildDailySession({
    formationId: SESSION_FORMATION,
    date: SESSION_DATE,
    dueNotions: SESSION_DUE_NOTIONS,
    gaps: SESSION_GAPS,
    bank: SESSION_BANK,
    lastFormats: SESSION_LAST_FORMATS,
    capMinutes: SESSION_CAP_BY_MODE[mode],
    mode,
    seed: SESSION_SEED,
    params: ENGINE.globalQuiz,
  });
}

/** CL-1 — no due notion at all. */
export function emptySession(): DailySession {
  return buildDailySession({
    formationId: SESSION_FORMATION,
    date: SESSION_DATE,
    dueNotions: [],
    gaps: [],
    bank: [],
    lastFormats: [],
    capMinutes: SESSION_CAP_MINUTES,
    mode: 'full',
    seed: SESSION_SEED,
    params: ENGINE.globalQuiz,
  });
}

/** CL-3 — the cap is below the first item cost. */
export function tightCapSession(): DailySession {
  return buildDailySession({
    formationId: SESSION_FORMATION,
    date: SESSION_DATE,
    dueNotions: [notion('n-s4', 'sap-m1', 1)],
    gaps: [],
    bank: [{ notionId: 'n-s4', formats: ['open_question'] }],
    lastFormats: [],
    capMinutes: 1,
    mode: 'full',
    seed: SESSION_SEED,
    params: ENGINE.globalQuiz,
  });
}

/** CL-5 — a due notion of the current module that was never evaluated. */
export function neverEvaluatedSession(): DailySession {
  return buildDailySession({
    formationId: SESSION_FORMATION,
    date: SESSION_DATE,
    dueNotions: [
      notion('n-notseen', 'sap-m4', 4, {
        moduleStatus: 'open',
        evaluated: false,
      }),
    ],
    gaps: [],
    bank: [{ notionId: 'n-notseen', formats: ['choice_question'] }],
    lastFormats: [],
    capMinutes: SESSION_CAP_MINUTES,
    mode: 'full',
    seed: SESSION_SEED,
    params: ENGINE.globalQuiz,
  });
}

/** ET-3 — a confusion gap whose imposed format is absent from the bank. */
export function exhaustedSession(): DailySession {
  return buildDailySession({
    formationId: SESSION_FORMATION,
    date: SESSION_DATE,
    dueNotions: [notion('n-type', 'sap-m2', 2)],
    gaps: [{ notionId: 'n-type', nature: 'confusion' }],
    bank: [{ notionId: 'n-type', formats: ['choice_question', 'cloze'] }],
    lastFormats: [{ notionId: 'n-type', format: 'choice_question' }],
    capMinutes: SESSION_CAP_MINUTES,
    mode: 'full',
    seed: SESSION_SEED,
    params: ENGINE.globalQuiz,
  });
}
