// Fixtures of the Réviser tests (SPEC-3305): the session of the demonstration dataset of
// 2026-11-11T12:20:00Z (five games, the fourth notion of the mockup).
import type {
  GlobalQuizSessionDto,
  ReviewItemDto,
  ReviewSummaryDto,
  WarmupDto,
} from '@learny/contracts';

const NOTION = '00000000-0000-4000-8000-000000000001';

function item(
  overrides: Partial<ReviewItemDto> & Pick<ReviewItemDto, 'position' | 'type'>,
): ReviewItemDto {
  return {
    brickId: `brick-${String(overrides.position)}`,
    brickVersionId: `version-${String(overrides.position)}`,
    name: 'Carte de rappel',
    tech: 'active recall',
    displayLabel: 'Variante d’exercice',
    scopeLabel: 'Module 3',
    reason: null,
    notionIds: [NOTION],
    payload: {
      front: 'Que définit une variante d’exercice comptable ?',
      back: 'Le nombre de périodes comptables d’un exercice, et leurs dates de début et de fin.',
      sourceLabel: 'votre cours du module 2, chapitre 2',
      sources: [],
    },
    intervals: {
      again: '2026-11-11T12:30:00.000Z',
      hard: '2026-11-21T12:20:00.000Z',
      good: '2026-11-23T12:20:00.000Z',
      easy: '2026-11-27T12:20:00.000Z',
    },
    state: 'todo',
    result: null,
    ...overrides,
  };
}

export const RECALL_ITEM = item({ position: 0, type: 'recall_card' });

export const MATCHING_ITEM = item({
  position: 1,
  type: 'matching',
  name: 'Association',
  displayLabel: 'Notions de base SAP',
  intervals: null,
  payload: {
    instruction: 'Notions de base SAP : reliez chaque notion à sa définition.',
    lefts: [
      { id: 'p1', text: 'Société' },
      { id: 'p2', text: 'Plan comptable' },
    ],
    rights: [
      { id: 'r1', text: 'Liste des comptes généraux utilisables' },
      { id: 'r2', text: 'Entité juridique qui tient sa propre comptabilité' },
    ],
    sources: [],
  },
});

export function session(overrides: Partial<GlobalQuizSessionDto> = {}): GlobalQuizSessionDto {
  return {
    sessionId: '00000000-0000-4000-8000-000000000010',
    attemptId: '00000000-0000-4000-8000-000000000011',
    formationId: '00000000-0000-4000-8000-000000000012',
    forDate: '2026-11-11',
    mode: 'full',
    status: 'in_progress',
    header: {
      notionCount: 14,
      modulesLabel: 'Modules 1 et 2 mêlés',
      estimatedMinutes: 10,
      subtitle: 'SAP S/4HANA Finance · session du mercredi 11 novembre',
    },
    modeOptions: { fullMinutes: 10, microMinutes: 5 },
    note: '',
    rationale: [
      {
        label: 'Lacune en priorité',
        text: 'la variante d’exercice revient en carte de rappel.',
      },
    ],
    tuned: [],
    smoothing: {
      actionId: '00000000-0000-4000-8000-000000000013',
      capMinutes: 15,
      targetRetention: 0.9,
      deferredCount: 4,
      deferredTo: '2026-11-12',
      estimatedMinutes: 10,
    },
    items: [RECALL_ITEM, MATCHING_ITEM],
    currentPosition: 0,
    summary: null,
    ...overrides,
  };
}

export const SUMMARY: ReviewSummaryDto = {
  reviewedCount: 5,
  minutes: 9,
  okCount: 4,
  soonCount: 1,
  streakDays: 13,
  nextSessionAt: '2026-11-12T16:00:00.000Z',
};

export const WARMUP: WarmupDto = {
  activityId: '00000000-0000-4000-8000-000000000020',
  formationId: '00000000-0000-4000-8000-000000000012',
  nextSession: {
    kind: 'validation_quiz',
    startsAt: '2026-11-11T14:00:00+01:00',
    href: '/formations/f/modules/m/quiz',
  },
  scope: 'yesterday_prerequisites',
  items: [
    {
      position: 0,
      notionId: NOTION,
      notionLabel: 'Clé de comptabilisation',
      tag: 'yesterday',
      moduleNumber: null,
      question: 'Quelle clé de comptabilisation pour un débit sur un compte général ?',
      answer: '40. Et 50 pour un crédit sur un compte général.',
    },
    {
      position: 1,
      notionId: '00000000-0000-4000-8000-000000000002',
      notionLabel: 'Date comptable',
      tag: 'prerequisite',
      moduleNumber: 2,
      question: 'Qu’est-ce qui distingue la date comptable de la date de pièce ?',
      answer: 'La date comptable fixe la période où l’écriture compte.',
    },
  ],
  answers: [],
  status: 'todo',
};
