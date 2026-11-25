// Jest + RNTL [quickfix mr-c] — exercice pratique (maquette Exercice.dc.html).
//
// Rendu de la consigne et du barème, puis action principale : saisir la production, la soumettre et
// afficher la correction du serveur. L'API est simulée ; l'écran ne calcule ni score ni verdict.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ExerciseSubmissionResult, PracticeExerciseDto } from '@learny/contracts';

import { ExerciceScreen } from '../../../src/features/mr/evaluation/ExerciceScreen';

const mockSubmit = jest.fn();
const mockHint = jest.fn();

jest.mock('../../../src/api/registry', () => ({
  requireApiClient: () => ({
    api: {
      exerciseSubmit: mockSubmit,
      exerciseHint: mockHint,
    },
  }),
}));

const EXERCISE_ID = '11111111-1111-4111-8111-111111111111';

const EXERCISE: PracticeExerciseDto = {
  exerciseId: EXERCISE_ID,
  formationId: '22222222-2222-4222-8222-222222222222',
  formationTitle: 'SAP S/4HANA Finance',
  moduleId: '33333333-3333-4333-8333-333333333333',
  moduleTitle: 'Clôture mensuelle',
  modulePosition: 3,
  notionId: '44444444-4444-4444-8444-444444444444',
  notionLabel: 'Comptes de régularisation',
  instruction: {
    title: 'Clôture mensuelle',
    taskMd:
      'Passez les écritures de régularisation de fin de mois pour la société FR01 : charges constatées d’avance et factures non parvenues.',
    data: ['Société FR01'],
    deliverable: 'Les écritures de régularisation, justifiées.',
    production: { kind: 'text', minChars: 0, maxChars: 2000 },
    explanationPrompt: null,
    hints: ['Commencez par les charges constatées d’avance.'],
    criteria: [
      { key: 'comptes', label: 'Comptes de régularisation corrects', points: 4, description: 'Les bons comptes.' },
      { key: 'montants', label: 'Montants et dates justes', points: 4, description: 'Les bons montants.' },
      { key: 'extourne', label: 'Extourne planifiée au 1er du mois', points: 2, description: 'L’extourne.' },
    ],
    estimatedMinutes: 20,
    passPoints: 8,
    sources: [],
  },
  attempt: null,
  mastery: 42,
  masteryThreshold: 80,
  hintsUsed: 0,
  hintsLeft: 2,
  maxScore: 10,
  revealedHints: [],
  gapNature: null,
};

const RESULT: ExerciseSubmissionResult = {
  attemptId: '55555555-5555-4555-8555-555555555555',
  status: 'graded',
  correction: {
    score: 7,
    maxScore: 10,
    verdict: 'retry',
    criteria: [
      { key: 'comptes', label: 'Comptes de régularisation corrects', points: 4, earned: 4, ok: true, comment: 'Comptes justes.' },
      { key: 'montants', label: 'Montants et dates justes', points: 4, earned: 3, ok: false, comment: 'Une date à corriger.' },
      { key: 'extourne', label: 'Extourne planifiée au 1er du mois', points: 2, earned: 0, ok: false, comment: 'Extourne absente.' },
    ],
    summary: 'Les comptes sont bons, l’extourne manque.',
    nextStep: { label: 'Revoir le chapitre', href: '/formations/f/programme' },
  },
  masteryBefore: 42,
  masteryAfter: 61,
  submittedAt: '2026-11-11T12:20:00.000Z',
};

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

async function renderExercice(): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <ExerciceScreen
          exercise={EXERCISE}
          onClose={jest.fn()}
          onAskTutor={jest.fn()}
          onOpenNextStep={jest.fn()}
        />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

function firstCallBody(mock: jest.Mock): Record<string, unknown> {
  const calls = mock.mock.calls as unknown as [{ body: Record<string, unknown> }][];
  const call = calls[0]?.[0];
  if (call === undefined) throw new Error('mutation non appelée');
  return call.body;
}

describe('[quickfix mr-c] exercice pratique', () => {
  beforeEach(() => {
    mockSubmit.mockReset();
    mockHint.mockReset();
    mockSubmit.mockResolvedValue(RESULT);
  });

  it('affiche la consigne et le barème de l’exercice', async () => {
    await renderExercice();
    expect(screen.getByTestId('qf-exercice')).toBeTruthy();
    expect(screen.getByText('Consigne')).toBeTruthy();
    expect(screen.getByText('Barème · 10 points')).toBeTruthy();
    expect(screen.getByText('Comptes de régularisation corrects')).toBeTruthy();
    expect(screen.getByTestId('qf-exercice-timer')).toBeTruthy();
  });

  it('soumet la production et affiche la correction du tuteur', async () => {
    await renderExercice();
    await fireEvent.changeText(
      screen.getByTestId('qf-exercice-text'),
      'Débit 486 / Crédit 606 pour les charges constatées d’avance.',
    );
    await fireEvent.press(screen.getByTestId('qf-exercice-submit'));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledTimes(1);
    });
    expect(firstCallBody(mockSubmit)).toEqual({
      submission: {
        kind: 'text',
        text: 'Débit 486 / Crédit 606 pour les charges constatées d’avance.',
        explanation: '',
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('qf-exercice-score')).toHaveTextContent('7 / 10');
    });
    expect(screen.getByTestId('qf-exercice-verdict')).toHaveTextContent('À retravailler');
    expect(screen.getByTestId('qf-exercice-correction')).toBeTruthy();
    expect(screen.getByText(/Maîtrise : 61 %/u)).toBeTruthy();
  });
});