// Fixtures of the validation quiz screens (SPEC-3304, § 12 plan de tests).
import type { AttemptDto, QuizQuestionDto, QuizResultDto } from '@learny/contracts';

const NOTION = '00000000-0000-4000-8000-0000000000aa';
const MODULE = '00000000-0000-4000-8000-0000000000bb';
const FORMATION = '00000000-0000-4000-8000-0000000000cc';
const NOW = '2026-11-11T12:20:00.000Z';

/** Public charge of a single choice question, as the server projects it (no correct answer). */
export const CHOICE_PAYLOAD = {
  stem: 'Une facture fournisseur est enregistrée le 12 novembre, avec une date de pièce au 31 octobre. Dans quelle période est-elle comptabilisée ?',
  mode: 'single',
  options: [
    { id: 'novembre', text: 'Novembre, la date de saisie' },
    { id: 'octobre', text: 'Octobre, la date de pièce' },
    { id: 'decembre', text: 'Décembre, la date d’échéance' },
  ],
  sources: [],
};

export function question(overrides: Partial<QuizQuestionDto> = {}): QuizQuestionDto {
  return {
    position: 1,
    brickVersionId: '00000000-0000-4000-8000-0000000000d1',
    type: 'choice_question',
    typeLabel: 'Application',
    notionId: NOTION,
    notionLabel: 'Chapitre 2',
    payload: CHOICE_PAYLOAD,
    state: 'unanswered',
    maxScore: 10,
    ...overrides,
  };
}

export function attempt(overrides: Partial<AttemptDto> = {}): AttemptDto {
  return {
    id: '00000000-0000-4000-8000-0000000000e1',
    kind: 'validation_quiz',
    attemptNo: 2,
    status: 'in_progress',
    moduleId: MODULE,
    formationId: FORMATION,
    threshold: 80,
    total: 2,
    questions: [question({ position: 1 }), question({ position: 2 })],
    startedAt: NOW,
    serverTime: NOW,
    ...overrides,
  };
}

export function result(overrides: Partial<QuizResultDto> = {}): QuizResultDto {
  return {
    attemptId: '00000000-0000-4000-8000-0000000000e1',
    attemptNo: 2,
    module: { id: MODULE, position: 3, title: 'Comptabilité générale' },
    status: 'graded',
    score: 58,
    provisionalScore: null,
    passed: false,
    threshold: 80,
    pointsMissing: 22,
    isLastModule: false,
    nextModule: {
      id: '00000000-0000-4000-8000-0000000000f1',
      position: 4,
      title: 'Contrôle de gestion',
    },
    history: [
      { attemptNo: 1, score: 46, passed: false },
      { attemptNo: 2, score: 58, passed: false },
    ],
    gaps: [
      {
        notionId: NOTION,
        label: 'Période comptable',
        nature: 'forgetting',
        natureLabel: 'Oubli',
        evidence: 'Deux questions ratées sur la période de comptabilisation.',
        proposal: 'Relire la règle du rattachement à l’exercice.',
        mastery: 34,
        trainHref: '/formations/f/modules/m/remediation',
      },
    ],
    mastered: [{ notionId: '00000000-0000-4000-8000-0000000000ab', label: 'Pièce comptable' }],
    perNotion: [
      {
        notionId: NOTION,
        label: 'Période comptable',
        correct: 1,
        total: 4,
        score: 25,
      },
    ],
    retry: {
      allowed: false,
      availableAt: '2026-11-12T12:20:00.000Z',
      reason: 'delay',
      remediationRequired: false,
      remediationDone: false,
    },
    remediation: { status: 'ready', href: '/formations/f/modules/m/remediation' },
    pendingOpenCount: 0,
    ...overrides,
  };
}
