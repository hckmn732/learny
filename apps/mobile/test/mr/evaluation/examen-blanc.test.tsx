// Jest + RNTL [quickfix mr-c] — examen blanc (maquette ExamenBlanc.dc.html).
//
// Action principale : lancer l'épreuve depuis l'introduction, naviguer entre les questions, la
// terminer après confirmation, puis lire le résultat du serveur. L'API est simulée ; l'écran ne
// calcule ni score ni verdict.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ExamAttemptDto, ExamIntroDto, ExamResultDto } from '@learny/contracts';

import { ExamenBlancScreen } from '../../../src/features/mr/evaluation/ExamenBlancScreen';

const mockIntro = jest.fn();
const mockStart = jest.fn();
const mockAttempt = jest.fn();
const mockResult = jest.fn();
const mockSave = jest.fn();
const mockMark = jest.fn();
const mockSubmit = jest.fn();

jest.mock('../../../src/api/registry', () => ({
  requireApiClient: () => ({
    api: {
      getExamIntro: mockIntro,
      startExamAttempt: mockStart,
      getExamAttempt: mockAttempt,
      getExamResult: mockResult,
      saveExamAnswer: mockSave,
      markExamQuestion: mockMark,
      submitExamAttempt: mockSubmit,
      confirmExamFormatRoute: jest.fn(),
    },
  }),
}));

const FORMATION_ID = '22222222-2222-4222-8222-222222222222';
const ATTEMPT_ID = '55555555-5555-4555-8555-555555555555';
const Q1 = '66666666-6666-4666-8666-666666666666';
const Q2 = '77777777-7777-4777-8777-777777777777';
const N1 = '88888888-8888-4888-8888-888888888888';
const M1 = '99999999-9999-4999-8999-999999999999';

const INTRO: ExamIntroDto = {
  formationId: FORMATION_ID,
  title: 'SAP S/4HANA Finance',
  format: {
    questionCount: 2,
    secondsPerQuestion: null,
    durationMin: 90,
    threshold: 70,
    source: 'guide',
    confirmed: true,
  },
  hasGuide: true,
  studiedModules: [{ moduleId: M1, position: 1, label: 'Module 1' }],
  diagnosticModules: [],
  diagnosticQuestionCount: 0,
  nextExams: [],
  lastAttempt: null,
};

const ATTEMPT: ExamAttemptDto = {
  id: ATTEMPT_ID,
  attemptNo: 1,
  formationId: FORMATION_ID,
  status: 'in_progress',
  threshold: 70,
  total: 2,
  questions: [
    {
      position: 1,
      brickVersionId: Q1,
      type: 'choice_question',
      typeLabel: 'Question à choix',
      notionId: N1,
      notionLabel: 'Comptabilité fournisseurs',
      moduleId: M1,
      modulePosition: 1,
      moduleLabel: 'Module 1',
      payload: {
        stem: 'Une facture fournisseur est bloquée au paiement. Quelle transaction permet de la débloquer ?',
        mode: 'single',
        options: [
          { id: 'o1', text: 'MRBR — Débloquer factures' },
          { id: 'o2', text: 'F110 — Paiement automatique' },
        ],
        sources: [],
      },
      marked: false,
      maxScore: 1,
    },
    {
      position: 2,
      brickVersionId: Q2,
      type: 'choice_question',
      typeLabel: 'Question à choix',
      notionId: N1,
      notionLabel: 'Comptabilité fournisseurs',
      moduleId: M1,
      modulePosition: 1,
      moduleLabel: 'Module 1',
      payload: {
        stem: 'Quel état liste les factures en attente de paiement ?',
        mode: 'single',
        options: [
          { id: 'o1', text: 'FBL1N' },
          { id: 'o2', text: 'FB60' },
        ],
        sources: [],
      },
      marked: false,
      maxScore: 1,
    },
  ],
  startedAt: '2026-11-11T12:20:00.000Z',
  deadlineAt: '2026-11-11T13:50:00.000Z',
  serverTime: '2026-11-11T12:20:00.000Z',
  remainingSeconds: 2700,
  answeredCount: 0,
  markedCount: 0,
};

const RESULT: ExamResultDto = {
  attemptId: ATTEMPT_ID,
  formationId: FORMATION_ID,
  status: 'graded',
  threshold: 70,
  durationMin: 90,
  timeUsedMin: 41,
  timedOut: false,
  score: 72,
  passed: true,
  answeredCount: 2,
  total: 2,
  studied: { score: 72, correct: 2, total: 2 },
  diagnostic: { score: 0, correct: 0, total: 0 },
  modules: [
    { moduleId: M1, position: 1, label: 'Module 1', studied: true, correct: 2, total: 2, score: 100 },
  ],
  gaps: [],
  plan: ['Relire le module 1 et refaire l’examen.'],
  review: [
    {
      position: 1,
      brickVersionId: Q1,
      typeLabel: 'Question à choix',
      question: 'Une facture fournisseur est bloquée au paiement. Quelle transaction permet de la débloquer ?',
      notionLabel: 'Comptabilité fournisseurs',
      modulePosition: 1,
      moduleLabel: 'Module 1',
      studied: true,
      isCorrect: true,
      given: 'F110 — Paiement automatique',
      expected: 'F110 — Paiement automatique',
      explanation: 'Le paiement automatique débloque la facture.',
    },
  ],
};

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

async function renderExam(): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <ExamenBlancScreen formationId={FORMATION_ID} onClose={jest.fn()} />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getByTestId('qf-examen-blanc-start')).toBeTruthy();
  });
}

describe('[quickfix mr-c] examen blanc', () => {
  beforeEach(() => {
    mockIntro.mockReset();
    mockStart.mockReset();
    mockAttempt.mockReset();
    mockResult.mockReset();
    mockSave.mockReset();
    mockMark.mockReset();
    mockSubmit.mockReset();
    mockIntro.mockResolvedValue(INTRO);
    mockStart.mockResolvedValue({ attemptId: ATTEMPT_ID });
    mockAttempt.mockResolvedValue(ATTEMPT);
    mockResult.mockResolvedValue(RESULT);
    mockSave.mockResolvedValue({ position: 1, savedAt: '2026-11-11T12:20:00.000Z' });
    mockMark.mockResolvedValue({ position: 1, marked: true });
    mockSubmit.mockResolvedValue({ status: 'graded', unansweredCount: 2, markedCount: 0 });
  });

  it('affiche les règles, la durée et le seuil avant l’épreuve', async () => {
    await renderExam();
    expect(screen.getByTestId('qf-examen-blanc-intro')).toBeTruthy();
    expect(screen.getByText('Les règles')).toBeTruthy();
    expect(screen.getByTestId('qf-examen-blanc-format-duration')).toHaveTextContent(/90 min/u);
    expect(screen.getByTestId('qf-examen-blanc-format-threshold')).toHaveTextContent(/70 %/u);
  });

  it('lance l’épreuve, navigue entre les questions et lit le résultat après remise', async () => {
    await renderExam();
    await fireEvent.press(screen.getByTestId('qf-examen-blanc-start'));

    await waitFor(() => {
      expect(screen.getByTestId('qf-examen-blanc-counter')).toHaveTextContent(/Question 1 sur 2/u);
    });
    expect(screen.getByTestId('qf-examen-blanc-timer')).toHaveTextContent('45:00');
    expect(screen.getByTestId('qf-examen-blanc-progress')).toBeTruthy();
    expect(screen.getByTestId('qf-examen-blanc-question')).toBeTruthy();
    expect(mockStart).toHaveBeenCalledWith({ params: { fid: FORMATION_ID } });

    await fireEvent.press(screen.getByTestId('qf-examen-blanc-next'));
    await waitFor(() => {
      expect(screen.getByTestId('qf-examen-blanc-counter')).toHaveTextContent(/Question 2 sur 2/u);
    });

    await fireEvent.press(screen.getByTestId('qf-examen-blanc-finish'));
    await waitFor(() => {
      expect(screen.getByTestId('qf-examen-blanc-confirm-submit')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('qf-examen-blanc-confirm-submit'));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith({ params: { aid: ATTEMPT_ID } });
    });
    await waitFor(() => {
      expect(screen.getByTestId('qf-examen-blanc-score')).toHaveTextContent('72 %');
    });
    expect(screen.getByTestId('qf-examen-blanc-result')).toBeTruthy();
    expect(screen.getByTestId('qf-examen-blanc-verdict')).toHaveTextContent('Seuil de 70 % atteint');
  });
});