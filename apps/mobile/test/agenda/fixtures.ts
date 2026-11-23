// Fixtures of the agenda tests (SPEC-3203): the day of the mockup — Wednesday 11 November 2026 —
// read in `Europe/Paris`, with the four activities of SPEC-115 and one activity on Thursday.
import type {
  AgendaDto,
  AgendaFormation,
  AgendaSlot,
  SlotAlternativesDto,
  SlotMoveOutput,
} from '@learny/contracts';

/** The three formations of the demonstration account. */
export const SAP: AgendaFormation = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'SAP S/4HANA Finance',
  sigle: 'SAP',
  status: 'active',
};
export const GPA: AgendaFormation = {
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Gestion de projet agile',
  sigle: 'GPA',
  status: 'active',
};
export const ANG: AgendaFormation = {
  id: '33333333-3333-4333-8333-333333333333',
  title: 'Anglais professionnel',
  sigle: 'ANG',
  status: 'paused',
};

export const FORMATIONS: readonly AgendaFormation[] = [SAP, GPA, ANG];

export const SLOT_IDS = {
  relecture: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa001',
  echauffement: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa002',
  quiz: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa003',
  global: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa004',
  reprise: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa005',
} as const;

export const RELECTURE_SLOT: AgendaSlot = {
  id: SLOT_IDS.relecture,
  formationId: SAP.id,
  moduleId: null,
  moduleNumber: 3,
  kind: 'course',
  typeLabel: 'Cours',
  title: 'Relecture du cours',
  meta: 'Module 3 · Saisie des pièces comptables',
  date: '2026-11-11',
  startsAt: '2026-11-11T08:00:00.000Z',
  endsAt: '2026-11-11T09:00:00.000Z',
  startMinutes: 540,
  endMinutes: 600,
  status: 'done',
  href: '/cours/cours-3',
  activityId: null,
  movable: false,
};

export const ECHAUFFEMENT_SLOT: AgendaSlot = {
  id: SLOT_IDS.echauffement,
  formationId: SAP.id,
  moduleId: null,
  moduleNumber: 3,
  kind: 'warmup',
  typeLabel: 'Échauffement',
  title: 'Échauffement',
  meta: '3 questions de rappel · 2 min',
  date: '2026-11-11',
  startsAt: '2026-11-11T12:50:00.000Z',
  endsAt: '2026-11-11T12:55:00.000Z',
  startMinutes: 830,
  endMinutes: 835,
  status: 'planned',
  href: '/reviser/echauffement',
  activityId: null,
  movable: true,
};

export const QUIZ_SLOT: AgendaSlot = {
  id: SLOT_IDS.quiz,
  formationId: SAP.id,
  moduleId: null,
  moduleNumber: 3,
  kind: 'validation_quiz',
  typeLabel: 'Quiz de validation',
  title: 'Quiz de validation',
  meta: 'Tentative 2 · seuil 80 % · 40 min',
  date: '2026-11-11',
  startsAt: '2026-11-11T13:00:00.000Z',
  endsAt: '2026-11-11T13:40:00.000Z',
  startMinutes: 840,
  endMinutes: 880,
  status: 'planned',
  href: '/quiz/attempt-2',
  activityId: null,
  movable: true,
};

export const QUIZ_GLOBAL_SLOT: AgendaSlot = {
  id: SLOT_IDS.global,
  formationId: SAP.id,
  moduleId: null,
  moduleNumber: 3,
  kind: 'global_quiz',
  typeLabel: 'Quiz global',
  title: 'Quiz global',
  meta: '14 notions · 10 min',
  date: '2026-11-11',
  startsAt: '2026-11-11T16:00:00.000Z',
  endsAt: '2026-11-11T16:10:00.000Z',
  startMinutes: 1020,
  endMinutes: 1030,
  status: 'planned',
  href: '/reviser/quiz-global',
  activityId: null,
  movable: true,
};

export const REPRISE_SLOT: AgendaSlot = {
  id: SLOT_IDS.reprise,
  formationId: SAP.id,
  moduleId: null,
  moduleNumber: 2,
  kind: 'revision',
  typeLabel: 'Révision',
  title: 'Reprise · ledgers parallèles',
  meta: 'Séance replacée par le tuteur · 20 min',
  date: '2026-11-12',
  startsAt: '2026-11-12T09:30:00.000Z',
  endsAt: '2026-11-12T09:50:00.000Z',
  startMinutes: 630,
  endMinutes: 650,
  status: 'planned',
  href: '/reviser/reprise',
  activityId: null,
  movable: true,
};

/** The four activities of the mockup, plus Thursday's reprise. */
export const SLOTS: readonly AgendaSlot[] = [
  RELECTURE_SLOT,
  ECHAUFFEMENT_SLOT,
  QUIZ_SLOT,
  QUIZ_GLOBAL_SLOT,
  REPRISE_SLOT,
];

/** Answer of `GET /agenda` for the week of the mockup. */
export const AGENDA: AgendaDto = {
  timezone: 'Europe/Paris',
  today: '2026-11-11',
  currentFormationId: SAP.id,
  bounds: { start: '2026-11-09', end: '2026-11-15' },
  captionPeriod: { start: '2026-11-09', end: '2026-11-15' },
  studyDays: [1, 2, 3, 4, 5, 6, 7],
  formations: [...FORMATIONS],
  slots: [...SLOTS],
  totals: { plannedMinutes: 1450, doneMinutes: 60, marginsRemaining: 2 },
  blockedModule: null,
};

/** Same account, on a period without any activity for the filtered formation (EF-8). */
export const EMPTY_AGENDA: AgendaDto = {
  ...AGENDA,
  slots: [],
  totals: { plannedMinutes: 0, doneMinutes: 0, marginsRemaining: 0 },
};

/** Three windows of the planner for the validation quiz (EF-7). */
export const ALTERNATIVES: SlotAlternativesDto = {
  slotId: QUIZ_SLOT.id,
  version: 'version-1',
  timezone: 'Europe/Paris',
  durationMinutes: 40,
  day: '2026-11-11',
  alternatives: [
    {
      date: '2026-11-12',
      startsAt: '2026-11-12T08:00:00.000Z',
      endsAt: '2026-11-12T08:40:00.000Z',
      startMinutes: 540,
      endMinutes: 580,
      moment: 'matin',
      reasons: ['Votre créneau de prédilection', 'Marge suffisante'],
    },
    {
      date: '2026-11-12',
      startsAt: '2026-11-12T13:00:00.000Z',
      endsAt: '2026-11-12T13:40:00.000Z',
      startMinutes: 840,
      endMinutes: 880,
      moment: 'apres_midi',
      reasons: ['Après votre pause'],
    },
    {
      date: '2026-11-12',
      startsAt: '2026-11-12T18:00:00.000Z',
      endsAt: '2026-11-12T18:40:00.000Z',
      startMinutes: 1140,
      endMinutes: 1180,
      moment: 'soir',
      reasons: ['Avant le bilan hebdomadaire'],
    },
  ],
};

/** The moved quiz, as `POST /slots/:sid/move` answers it. */
export const MOVED: SlotMoveOutput = {
  movedSlot: {
    ...QUIZ_SLOT,
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa009',
    date: '2026-11-12',
    startsAt: '2026-11-12T08:00:00.000Z',
    endsAt: '2026-11-12T08:40:00.000Z',
    startMinutes: 540,
    endMinutes: 580,
  },
  replacedSlotId: QUIZ_SLOT.id,
  version: 'version-2',
  explanation: 'Votre quiz de validation est replacé au jeudi 9:00, dans votre créneau du matin.',
  agenda: AGENDA,
};
