// Oracle vectors of the ten automation explanations (SPEC-2205).
//
// Runs the TypeScript definitions on frozen journal rows, so the pytest suite compares the Python
// port to the source of truth instead of to a hand-written expectation. Only `explain` is compared:
// `apply`/`undo` take a database transaction and are proved by the server integration tests.
//
//   corepack pnpm exec tsx tools/engagement/oracle-definitions.mjs
import { writeFileSync } from 'node:fs';

import { automationRegistry } from '../../packages/automations/src/index.ts';

const CREATED = '2026-11-11T12:20:00.000Z';
const ZONE = 'Europe/Paris';

const action = (key, kind, status, payload, extra = {}) => ({
  id: '00000000-0000-4000-8000-000000000001',
  automation: key,
  kind,
  summary: '',
  formationId: '00000000-0000-4000-8000-000000000010',
  payload,
  undoPayload: null,
  requiresConsent: true,
  status,
  decidedAt: status === 'pending_consent' ? null : CREATED,
  createdAt: CREATED,
  ...extra,
});

const microPayload = {
  dedupeKey: 'micro:2026-11-11',
  date: '2026-11-11',
  hour: 20,
  durationMin: 5,
  formationId: '00000000-0000-4000-8000-000000000010',
  notionCount: 3,
};

const repriseProposed = {
  dedupeKey: 'missed:slot:1',
  createdOn: CREATED,
  formationId: '00000000-0000-4000-8000-000000000010',
  formationTitle: 'Permis bateau',
  title: 'Module 2 — Les bases',
  missedDate: '2026-11-10',
  missedSlotId: '00000000-0000-4000-8000-000000000020',
  proposed: {
    startsAt: '2026-11-12T17:00:00.000Z',
    endsAt: '2026-11-12T18:00:00.000Z',
    bufferSlotId: null,
    inBuffer: false,
  },
  alternatives: [],
};

const repriseShort = {
  dedupeKey: 'short:2026-11-11',
  createdOn: CREATED,
  formationId: '00000000-0000-4000-8000-000000000010',
  formationTitle: 'Permis bateau',
  inactiveDays: 3,
  proposed: {
    startsAt: '2026-11-11T18:00:00.000Z',
    endsAt: '2026-11-11T18:05:00.000Z',
  },
  alternatives: [],
};

const reprisePlan = {
  dedupeKey: 'plan:2026-11-11',
  createdOn: CREATED,
  formationId: '00000000-0000-4000-8000-000000000010',
  formationTitle: 'Permis bateau',
  reason: 'no_room',
  inactiveDays: 5,
  options: [{ kind: 'shift_end' }, { kind: 'lighten' }],
};

const echauffement = {
  dedupeKey: 'warmup:2026-11-11',
  date: '2026-11-11',
  count: 3,
  notionLabels: ['Amers', 'Balises'],
  reviewNotionLabels: ['Amers'],
  knewCount: 2,
  reviewRemaining: false,
  formationId: '00000000-0000-4000-8000-000000000010',
  nextSession: {
    slotId: '00000000-0000-4000-8000-000000000030',
    kind: 'course',
    startsAt: '2026-11-11T18:00:00.000Z',
    moduleId: '00000000-0000-4000-8000-000000000040',
    activityId: null,
  },
};

const jeuLacune = {
  dedupeKey: 'game:1',
  notionId: '00000000-0000-4000-8000-000000000050',
  notionLabel: 'Amers',
  nature: 'forgetting',
  format: 'recall_card',
  pendingGeneration: false,
};

const jeuExercise = {
  dedupeKey: 'game:2',
  notionId: '00000000-0000-4000-8000-000000000050',
  notionLabel: 'Amers',
  nature: 'application',
  startsAt: '2026-11-12T17:00:00.000Z',
  endsAt: '2026-11-12T17:15:00.000Z',
};

const remediation = {
  dedupeKey: 'remediation:1',
  attemptId: '00000000-0000-4000-8000-000000000060',
  attemptNo: 1,
  moduleId: '00000000-0000-4000-8000-000000000040',
  moduleTitle: 'Module 2',
  modulePosition: 2,
  formationId: '00000000-0000-4000-8000-000000000010',
  score: 40,
  remediationActivityId: null,
  paused: false,
  mode: 'mandatory',
  plan: {
    retry: { startsAt: '2026-11-12T17:00:00.000Z', endsAt: '2026-11-12T18:00:00.000Z' },
  },
};

const sprint = {
  dedupeKey: 'sprint:1',
  formationId: '00000000-0000-4000-8000-000000000010',
  examSlotId: '00000000-0000-4000-8000-000000000070',
  examTitle: 'Examen blanc',
  examDate: '2026-11-20',
  moduleId: '00000000-0000-4000-8000-000000000040',
  durationMin: 30,
  notionLabels: ['Amers', 'Balises'],
  targets: [
    {
      label: 'J-3',
      day: '2026-11-17',
      slotId: null,
      startsAt: '2026-11-17T17:00:00.000Z',
      endsAt: '2026-11-17T17:30:00.000Z',
      durationMin: 30,
    },
  ],
  impossible: [],
};

const bilan = {
  dedupeKey: 'weekly:2026-45',
  weekKey: '2026-W45',
  studyMinutes: 125,
  retention: { rate: 82 },
  atRiskCount: 2,
  reviewOn: CREATED,
  plan: [],
};

const cases = [
  ['reprise', 'reprise_proposed', 'pending_consent', repriseProposed, 'tu'],
  [
    'reprise',
    'reprise_proposed',
    'applied',
    { ...repriseProposed, chosenStartsAt: '2026-11-12T17:00:00.000Z' },
    'vous',
  ],
  ['reprise', 'reprise_proposed', 'undone', repriseProposed, 'tu'],
  ['reprise', 'reprise_proposed', 'declined', repriseProposed, 'vous'],
  ['reprise', 'reprise_short_proposed', 'pending_consent', repriseShort, 'tu'],
  [
    'reprise',
    'reprise_short_proposed',
    'applied',
    { ...repriseShort, chosenStartsAt: '2026-11-11T18:00:00.000Z' },
    'vous',
  ],
  ['reprise', 'plan_change_proposed', 'pending_consent', reprisePlan, 'tu'],
  [
    'reprise',
    'plan_change_proposed',
    'applied',
    { ...reprisePlan, chosenOption: 'shift_end' },
    'vous',
  ],
  ['reprise', 'plan_change_proposed', 'declined', reprisePlan, 'tu'],
  ['micro_seance', 'micro_session_proposed', 'pending_consent', microPayload, 'tu'],
  ['micro_seance', 'micro_session_proposed', 'consumed', microPayload, 'vous'],
  ['micro_seance', 'micro_session_proposed', 'expired', microPayload, 'tu'],
  ['micro_seance', 'micro_session_proposed', 'undone', microPayload, 'vous'],
  ['micro_seance', 'micro_session_proposed', 'declined', microPayload, 'tu'],
  ['echauffement', 'warmup_added', 'applied', echauffement, 'tu'],
  ['echauffement', 'warmup_added', 'consumed', echauffement, 'vous'],
  ['echauffement', 'warmup_added', 'expired', echauffement, 'tu'],
  ['echauffement', 'warmup_added', 'undone', echauffement, 'vous'],
  ['jeu_lacune', 'game_chosen', 'applied', jeuLacune, 'tu'],
  ['jeu_lacune', 'game_chosen', 'undone', jeuLacune, 'vous'],
  ['jeu_lacune', 'exercise_scheduled', 'applied', jeuExercise, 'tu'],
  ['jeu_lacune', 'exercise_scheduled', 'undone', jeuExercise, 'vous'],
  ['jeu_lacune', 'game_chosen', 'expired', { ...jeuLacune, nature: 'application' }, 'tu'],
  [
    'questions_cartes',
    'card_created',
    'pending_consent',
    {
      ...jeuLacune,
      question: 'Qu’est-ce qu’un amer ?',
      answer: 'Un point remarquable.',
      sourceLabel: 'Cours 2',
    },
    'tu',
  ],
  [
    'questions_cartes',
    'card_created',
    'applied',
    { ...jeuLacune, brickId: '00000000-0000-4000-8000-000000000080' },
    'vous',
  ],
  ['questions_cartes', 'card_created', 'declined', jeuLacune, 'tu'],
  ['questions_cartes', 'card_created', 'undone', jeuLacune, 'vous'],
  ['questions_cartes', 'card_created', 'expired', jeuLacune, 'tu'],
  ['questions_cartes', 'card_created', 'consumed', jeuLacune, 'vous'],
  [
    'plafond_quiz',
    'quiz_smoothed',
    'applied',
    {
      dueCount: 22,
      deferredNotionIds: ['a', 'b'],
      deferredTo: '2026-11-12',
      maxMinutes: 15,
      localDate: '2026-11-11',
    },
    'tu',
  ],
  [
    'plafond_quiz',
    'quiz_smoothed',
    'undone',
    {
      dueCount: 22,
      deferredNotionIds: ['a'],
      deferredTo: '2026-11-12',
      maxMinutes: 15,
      localDate: '2026-11-11',
    },
    'vous',
  ],
  [
    'plafond_quiz',
    'quiz_smoothed',
    'applied',
    {
      dueCount: 4,
      deferredNotionIds: [],
      deferredTo: '2026-11-12',
      maxMinutes: 15,
      localDate: '2026-11-11',
    },
    'tu',
  ],
  ['sprint', 'sprint_planned', 'pending_consent', sprint, 'tu'],
  ['sprint', 'sprint_planned', 'undone', sprint, 'vous'],
  ['sprint', 'sprint_planned', 'declined', sprint, 'tu'],
  ['sprint', 'sprint_planned', 'expired', sprint, 'vous'],
  ['bilan', 'weekly_review', 'applied', bilan, 'tu'],
  ['bilan', 'weekly_review', 'declined', bilan, 'vous'],
  ['bilan', 'weekly_review', 'undone', { ...bilan, retention: { rate: null } }, 'tu'],
  ['bilan', 'weekly_review', 'expired', { ...bilan, atRiskCount: 0 }, 'vous'],
  ['remediation', 'remediation_ready', 'applied', remediation, 'tu'],
  ['remediation', 'remediation_ready', 'undone', remediation, 'vous'],
  ['pause', 'pause_started', 'applied', { endDate: '2026-11-18', pauseId: 'p1' }, 'tu'],
  ['pause', 'pause_ended', 'applied', { endDate: '2026-11-18', diagnosticEnabled: true }, 'vous'],
  ['pause', 'pause_ended', 'applied', { endDate: '2026-11-18', diagnosticEnabled: false }, 'tu'],
  ['pause', 'pause_ended', 'undone', { endDate: '2026-11-18', diagnosticEnabled: false }, 'vous'],
  ['pause', 'pause_ended', 'declined', { endDate: '2026-11-18', diagnosticEnabled: true }, 'tu'],
];

const outputs = cases.map(([key, kind, status, payload, tone]) => {
  const definition = automationRegistry.require(key);
  return {
    key,
    kind,
    status,
    tone,
    timeZone: ZONE,
    payload,
    createdAt: CREATED,
    summary: definition.explain(action(key, kind, status, payload), tone, ZONE),
  };
});

writeFileSync(
  new URL('../../packages-py/learny/tests/fixtures/engagement_definitions.json', import.meta.url),
  `${JSON.stringify({ version: 1, generatedAt: '2026-11-11T12:20:00.000Z', cases: outputs }, null, 2)}\n`,
);
process.stdout.write(`Wrote ${String(outputs.length)} definition vectors\n`);
