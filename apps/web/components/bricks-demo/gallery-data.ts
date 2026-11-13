// Static gallery data (SPEC-503 ET-5): the SPEC-501 examples, their public projection and the
// static corrections used until SPEC-502 ships `gradeBrick`.
import { brickExamples, brickRegistry, type BrickType } from '@learny/bricks';
import type { CorrectionView as CorrectionViewType } from '@learny/bricks/view';
import type {
  BrickVariant,
  BrickViewBrick,
  BrickViewProps,
  CorrectionView,
} from '@learny/bricks/view';

export type GalleryState = 'idle' | 'answered' | 'corrected-ok' | 'corrected-ko';

export const GALLERY_STATES: GalleryState[] = ['idle', 'answered', 'corrected-ok', 'corrected-ko'];

export const VARIANTS: BrickVariant[] = ['quiz', 'game', 'exam', 'review', 'course', 'exercise'];

const NOTIONS = ['Type de pièce', 'Journal universel', 'Clés de comptabilisation'];

export const VARIANT_OF: Record<BrickType, BrickVariant> = {
  text: 'course',
  resource_excerpt: 'course',
  choice_question: 'quiz',
  open_question: 'exercise',
  cloze: 'quiz',
  matching: 'quiz',
  ordering: 'game',
  categorization: 'game',
  recall_card: 'game',
  instruction: 'exercise',
  scripted_dialogue: 'course',
  timer: 'exam',
  scoring: 'exercise',
};

const choiceCorrection = (correct: boolean): CorrectionViewType<'choice_question'> => ({
  kind: 'choice_question',
  isCorrect: correct,
  feedbackTitle: correct ? 'Exact.' : 'Pas tout à fait.',
  explanation:
    'Le type de pièce classe toute la pièce ; la clé de comptabilisation agit poste par poste.',
  options: [
    { id: 'a', correct: false, rationale: 'La clé agit poste par poste.' },
    { id: 'b', correct: true, rationale: 'Le type SA classe toute la pièce.' },
    { id: 'c', correct: false },
  ],
});

const RESOURCES: Record<
  BrickType,
  {
    responses: Partial<Record<GalleryState, unknown>>;
    corrections: Partial<Record<GalleryState, unknown>>;
  }
> = {
  text: {
    responses: {},
    corrections: { 'corrected-ok': { kind: 'text' }, 'corrected-ko': { kind: 'text' } },
  },
  resource_excerpt: {
    responses: {},
    corrections: {
      'corrected-ok': { kind: 'resource_excerpt' },
      'corrected-ko': { kind: 'resource_excerpt' },
    },
  },
  choice_question: {
    responses: {
      answered: { optionIds: ['b'] },
      'corrected-ok': { optionIds: ['b'] },
      'corrected-ko': { optionIds: ['a'] },
    },
    corrections: {
      'corrected-ok': choiceCorrection(true),
      'corrected-ko': choiceCorrection(false),
    },
  },
  open_question: {
    responses: {
      answered: { text: 'La partie double garantit l’équilibre.' },
      'corrected-ok': { text: 'La partie double garantit l’équilibre.' },
      'corrected-ko': { text: 'Je ne sais pas.' },
    },
    corrections: {
      'corrected-ok': {
        kind: 'open_question',
        isCorrect: true,
        feedbackTitle: 'Exact.',
        tutorNote: 'Bonne réponse, l’équilibre est bien expliqué.',
        score: 8,
        maxScore: 10,
        criteria: [
          { key: 'principe', label: 'Principe de la partie double', ok: true, points: 5 },
          { key: 'equilibre', label: 'Équilibre débit-crédit', ok: true, points: 3 },
        ],
        missingElements: [],
      },
      'corrected-ko': {
        kind: 'open_question',
        isCorrect: false,
        feedbackTitle: 'Pas tout à fait.',
        tutorNote: 'Reprenez la règle de la partie double.',
        score: 2,
        maxScore: 10,
        criteria: [
          { key: 'principe', label: 'Principe de la partie double', ok: false, points: 0 },
          { key: 'equilibre', label: 'Équilibre débit-crédit', ok: false, points: 2 },
        ],
        missingElements: ['La traçabilité des flux'],
      },
    },
  },
  cloze: {
    responses: {
      answered: { gaps: { '1': 'produits', '2': 'charges', '3': 'résultat' } },
      'corrected-ok': { gaps: { '1': 'produits', '2': 'charges', '3': 'résultat' } },
      'corrected-ko': { gaps: { '1': 'univers', '2': 'charges', '3': 'résultat' } },
    },
    corrections: {
      'corrected-ok': {
        kind: 'cloze',
        isCorrect: true,
        feedbackTitle: 'Exact.',
        explanation: 'Les produits diminués des charges donnent le résultat.',
        gaps: [
          { id: 1, expected: 'produits', given: 'produits', correct: true },
          { id: 2, expected: 'charges', given: 'charges', correct: true },
          { id: 3, expected: 'résultat', given: 'résultat', correct: true },
        ],
      },
      'corrected-ko': {
        kind: 'cloze',
        isCorrect: false,
        feedbackTitle: 'Pas tout à fait.',
        explanation: 'Les produits diminués des charges donnent le résultat.',
        gaps: [
          { id: 1, expected: 'produits', given: 'univers', correct: false },
          { id: 2, expected: 'charges', given: 'charges', correct: true },
          { id: 3, expected: 'résultat', given: 'résultat', correct: true },
        ],
      },
    },
  },
  matching: {
    responses: {
      answered: { pairs: { a: 'r2', b: 'r1', c: 'r3' } },
      'corrected-ok': { pairs: { a: 'r2', b: 'r1', c: 'r3' } },
      'corrected-ko': { pairs: { a: 'r1', b: 'r2', c: 'r3' } },
    },
    corrections: {
      'corrected-ok': {
        kind: 'matching',
        isCorrect: true,
        feedbackTitle: 'Exact.',
        explanation: 'Chaque pièce appartient à un cycle comptable.',
        pairs: [
          { pairId: 'a', expectedRightId: 'r2', givenRightId: 'r2', correct: true },
          { pairId: 'b', expectedRightId: 'r1', givenRightId: 'r1', correct: true },
          { pairId: 'c', expectedRightId: 'r3', givenRightId: 'r3', correct: true },
        ],
      },
      'corrected-ko': {
        kind: 'matching',
        isCorrect: false,
        feedbackTitle: 'Pas tout à fait.',
        explanation: 'Chaque pièce appartient à un cycle comptable.',
        pairs: [
          { pairId: 'a', expectedRightId: 'r2', givenRightId: 'r1', correct: false },
          { pairId: 'b', expectedRightId: 'r1', givenRightId: 'r2', correct: false },
          { pairId: 'c', expectedRightId: 'r3', givenRightId: 'r3', correct: true },
        ],
      },
    },
  },
  ordering: {
    responses: {
      answered: { order: ['a', 'b', 'c'] },
      'corrected-ok': { order: ['a', 'b', 'c'] },
      'corrected-ko': { order: ['b', 'a', 'c'] },
    },
    corrections: {
      'corrected-ok': {
        kind: 'ordering',
        isCorrect: true,
        feedbackTitle: 'Exact.',
        explanation: 'La clôture suit l’enregistrement, la justification puis l’arrêté.',
        positions: [
          { id: 'a', expectedIndex: 0, givenIndex: 0, correct: true },
          { id: 'b', expectedIndex: 1, givenIndex: 1, correct: true },
          { id: 'c', expectedIndex: 2, givenIndex: 2, correct: true },
        ],
      },
      'corrected-ko': {
        kind: 'ordering',
        isCorrect: false,
        feedbackTitle: 'Pas tout à fait.',
        explanation: 'La clôture suit l’enregistrement, la justification puis l’arrêté.',
        positions: [
          { id: 'a', expectedIndex: 0, givenIndex: 1, correct: false },
          { id: 'b', expectedIndex: 1, givenIndex: 0, correct: false },
          { id: 'c', expectedIndex: 2, givenIndex: 2, correct: true },
        ],
      },
    },
  },
  categorization: {
    responses: {
      answered: { assignments: { a: 'actif', b: 'actif', c: 'passif', d: 'passif' } },
      'corrected-ok': { assignments: { a: 'actif', b: 'actif', c: 'passif', d: 'passif' } },
      'corrected-ko': { assignments: { a: 'passif', b: 'actif', c: 'passif', d: 'passif' } },
    },
    corrections: {
      'corrected-ok': {
        kind: 'categorization',
        isCorrect: true,
        feedbackTitle: 'Exact.',
        explanation: 'L’actif regroupe les emplois, le passif les ressources.',
        items: [
          { id: 'a', expectedCategoryId: 'actif', givenCategoryId: 'actif', correct: true },
          { id: 'b', expectedCategoryId: 'actif', givenCategoryId: 'actif', correct: true },
          { id: 'c', expectedCategoryId: 'passif', givenCategoryId: 'passif', correct: true },
          { id: 'd', expectedCategoryId: 'passif', givenCategoryId: 'passif', correct: true },
        ],
      },
      'corrected-ko': {
        kind: 'categorization',
        isCorrect: false,
        feedbackTitle: 'Pas tout à fait.',
        explanation: 'L’actif regroupe les emplois, le passif les ressources.',
        items: [
          { id: 'a', expectedCategoryId: 'actif', givenCategoryId: 'passif', correct: false },
          { id: 'b', expectedCategoryId: 'actif', givenCategoryId: 'actif', correct: true },
          { id: 'c', expectedCategoryId: 'passif', givenCategoryId: 'passif', correct: true },
          { id: 'd', expectedCategoryId: 'passif', givenCategoryId: 'passif', correct: true },
        ],
      },
    },
  },
  recall_card: {
    responses: {
      answered: { selfGrade: 'good' },
      'corrected-ok': { selfGrade: 'good' },
      'corrected-ko': { selfGrade: 'again' },
    },
    corrections: {
      'corrected-ok': {
        kind: 'recall_card',
        isCorrect: true,
        feedbackTitle: 'Exact.',
        selfGrade: 'good',
      },
      'corrected-ko': {
        kind: 'recall_card',
        isCorrect: false,
        feedbackTitle: 'Pas tout à fait.',
        selfGrade: 'again',
      },
    },
  },
  instruction: {
    responses: {
      answered: {
        fields: { type: 'SA', date: '12/11/2026' },
        rows: [
          { cle: '40', compte: '606400', montant: '120' },
          { cle: '50', compte: '512000', montant: '120' },
        ],
        explanation: 'La charge augmente au débit, la banque diminue au crédit.',
      },
      'corrected-ok': {
        fields: { type: 'SA' },
        rows: [
          { cle: '40', compte: '606400', montant: '120' },
          { cle: '50', compte: '512000', montant: '120' },
        ],
      },
      'corrected-ko': {
        fields: { type: 'KR' },
        rows: [
          { cle: '31', compte: '401000', montant: '120' },
          { cle: '50', compte: '512000', montant: '100' },
        ],
      },
    },
    corrections: {
      'corrected-ok': {
        kind: 'instruction',
        isCorrect: true,
        feedbackTitle: 'Exact.',
        tutorNote: 'Saisie juste et bien expliquée.',
        score: 10,
        maxScore: 10,
        verdict: 'Réussi',
        criteria: [
          { key: 'type', label: 'Type de pièce', ok: true, points: 2 },
          { key: 'charge', label: 'Poste de charge', ok: true, points: 2 },
          { key: 'banque', label: 'Poste de banque', ok: true, points: 2 },
          { key: 'equilibre', label: 'Pièce équilibrée', ok: true, points: 2 },
          { key: 'explication', label: 'Explication', ok: true, points: 2 },
        ],
      },
      'corrected-ko': {
        kind: 'instruction',
        isCorrect: false,
        feedbackTitle: 'Pas tout à fait.',
        tutorNote: 'La charge va au débit et la banque au crédit.',
        score: 4,
        maxScore: 10,
        verdict: 'À retravailler',
        criteria: [
          { key: 'type', label: 'Type de pièce', ok: false, points: 0 },
          { key: 'charge', label: 'Poste de charge', ok: false, points: 0 },
          { key: 'banque', label: 'Poste de banque', ok: true, points: 2 },
          { key: 'equilibre', label: 'Pièce équilibrée', ok: false, points: 0 },
          { key: 'explication', label: 'Explication', ok: true, points: 2 },
        ],
      },
    },
  },
  scripted_dialogue: {
    responses: {},
    corrections: {
      'corrected-ok': {
        kind: 'scripted_dialogue',
        isCorrect: true,
        feedbackTitle: 'Exact.',
        criteria: [{ key: 'distinction', label: 'Distinction prix / volume', ok: true, points: 5 }],
      },
      'corrected-ko': {
        kind: 'scripted_dialogue',
        isCorrect: false,
        feedbackTitle: 'Pas tout à fait.',
        criteria: [
          { key: 'distinction', label: 'Distinction prix / volume', ok: false, points: 0 },
        ],
      },
    },
  },
  timer: {
    responses: {},
    corrections: { 'corrected-ok': { kind: 'timer' }, 'corrected-ko': { kind: 'timer' } },
  },
  scoring: {
    responses: {},
    corrections: { 'corrected-ok': { kind: 'scoring' }, 'corrected-ko': { kind: 'scoring' } },
  },
};

export function galleryBrick(type: BrickType): BrickViewBrick<BrickType> {
  const payload = brickExamples[type].valid;
  const versionId = `00000000-0000-4000-8000-${String(BRICK_TYPES_INDEX[type]).padStart(12, '0')}`;
  return {
    versionId,
    type,
    notionLabels: NOTIONS,
    publicPayload: brickRegistry[type].toPublic(payload as never, versionId),
  };
}

const BRICK_TYPES_INDEX: Record<BrickType, number> = {
  text: 1,
  resource_excerpt: 2,
  choice_question: 3,
  open_question: 4,
  cloze: 5,
  matching: 6,
  ordering: 7,
  categorization: 8,
  recall_card: 9,
  instruction: 10,
  scripted_dialogue: 11,
  timer: 12,
  scoring: 13,
};

export function galleryProps(
  type: BrickType,
  state: GalleryState,
  overrides: Partial<BrickViewProps<BrickType>> = {},
): BrickViewProps<BrickType> {
  const data = RESOURCES[type];
  const correction =
    state === 'corrected-ok' || state === 'corrected-ko'
      ? (data.corrections[state] as CorrectionView)
      : undefined;
  return {
    brick: galleryBrick(type),
    variant: VARIANT_OF[type],
    value: (data.responses[state] ?? null) as never,
    status:
      state === 'corrected-ok' || state === 'corrected-ko'
        ? 'corrected'
        : state === 'answered'
          ? 'answered'
          : 'idle',
    ...(correction === undefined ? {} : { correction }),
    ...overrides,
  };
}

export { NOTIONS };
