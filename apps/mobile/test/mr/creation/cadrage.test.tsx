// Jest + RNTL [quickfix mr-b] — cadrage avec le tuteur (maquette Cadrage.dc.html).
//
// Le client d'API est simulé à la frontière du registre : l'écran exécute ses vrais hooks,
// TanStack Query et les composants du design system. Deux parcours sont prouvés : la reprise d'un
// cadrage existant avec une réponse rapide, et la création d'une formation depuis le champ sujet.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { CadrageMessage, CadrageStateDto } from '@learny/contracts';

import { CadrageScreen } from '../../../src/features/mr/creation/CadrageScreen';
import { expectAccessible, expectMinTouchTarget } from '../../utils/expectAccessible';

const FORMATION_ID = '00000000-0000-4000-8000-0000000000b1';

const mockApi = {
  formationsCreate: jest.fn(),
  cadrageGet: jest.fn(),
  cadrageMessageCreate: jest.fn(),
  cadrageComplete: jest.fn(),
};

jest.mock('../../../src/api/registry', () => ({
  requireApiClient: () => ({ api: mockApi }),
}));

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: () => false,
};
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

const PROFILE = {
  scope: { value: 'SAP S/4HANA Finance', state: 'done' as const },
  starting_point: { value: null, state: 'waiting' as const },
  target_level: { value: null, state: 'todo' as const },
  volume: { value: null, state: 'todo' as const },
  dates: { value: null, state: 'todo' as const },
};

function message(
  partial: Partial<CadrageMessage> & Pick<CadrageMessage, 'id' | 'role' | 'content'>,
): CadrageMessage {
  return {
    questionNumber: null,
    suggestions: null,
    multi: false,
    createdAt: '2026-11-11T12:20:00Z',
    ...partial,
  };
}

const FIRST_QUESTION = message({
  id: '00000000-0000-4000-8000-0000000000c1',
  role: 'tutor',
  content:
    'Tu veux apprendre SAP S/4HANA Finance. Qu’est-ce que tu veux être capable de faire à la fin ?',
  questionNumber: 1,
});

const SECOND_QUESTION = message({
  id: '00000000-0000-4000-8000-0000000000c2',
  role: 'tutor',
  content: 'Noté. Où en es-tu aujourd’hui ?',
  questionNumber: 2,
  suggestions: [
    {
      label: 'Je découvre complètement',
      value: 'debutant',
      description: null,
      multi: false,
    },
    {
      label: 'J’ai les bases de la comptabilité',
      value: 'bases',
      description: null,
      multi: false,
    },
  ],
});

function state(
  messages: readonly CadrageMessage[],
  overrides: Partial<CadrageStateDto> = {},
): CadrageStateDto {
  return {
    formationId: FORMATION_ID,
    title: 'SAP S/4HANA Finance',
    messages: [...messages],
    profile: PROFILE,
    questionsAsked: 2,
    finished: false,
    canGenerate: false,
    pendingQuestion: { messageId: SECOND_QUESTION.id, questionKey: 'starting_point', multi: false },
    error: null,
    ...overrides,
  };
}

const INITIAL = state([FIRST_QUESTION, SECOND_QUESTION]);

function client(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

async function renderScreen(): Promise<void> {
  await render(
    <QueryClientProvider client={client()}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <CadrageScreen />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

describe('[quickfix mr-b] cadrage', () => {
  it('reprend un cadrage et envoie une réponse rapide au tuteur', async () => {
    mockParams = { fid: FORMATION_ID };
    mockApi.cadrageGet.mockResolvedValue(INITIAL);
    const learner = message({
      id: '00000000-0000-4000-8000-0000000000c3',
      role: 'learner',
      content: 'Je découvre complètement',
    });
    const third = message({
      id: '00000000-0000-4000-8000-0000000000c4',
      role: 'tutor',
      content: 'Très bien : on part des bases. Combien de temps par semaine ?',
      questionNumber: 3,
    });
    mockApi.cadrageMessageCreate.mockResolvedValue(
      state([FIRST_QUESTION, SECOND_QUESTION, learner, third], {
        questionsAsked: 3,
        pendingQuestion: { messageId: third.id, questionKey: 'volume', multi: false },
      }),
    );

    await renderScreen();
    await waitFor(() => {
      expect(screen.getByText('Nouvelle formation · question 2 sur 5')).toBeTruthy();
    });
    expect(screen.getByText('Noté. Où en es-tu aujourd’hui ?')).toBeTruthy();
    expectAccessible(screen, 'qf-cadrage-close', { role: 'button', label: 'Fermer' });

    await fireEvent.press(screen.getByTestId('qf-cadrage-suggestion-0'));

    await waitFor(() => {
      expect(mockApi.cadrageMessageCreate).toHaveBeenCalledTimes(1);
    });
    expect(mockApi.cadrageMessageCreate).toHaveBeenCalledWith(
      { params: { fid: FORMATION_ID }, body: { content: 'Je découvre complètement' } },
      { idempotencyKey: expect.any(String) as string },
    );
    await waitFor(() => {
      expect(
        screen.getByText('Très bien : on part des bases. Combien de temps par semaine ?'),
      ).toBeTruthy();
    });
  });

  it('crée la formation depuis le champ sujet puis affiche la première question', async () => {
    mockApi.formationsCreate.mockResolvedValue({
      formation: { id: FORMATION_ID, title: 'SAP S/4HANA Finance', status: 'cadrage' },
      cadrage: INITIAL,
    });

    await renderScreen();
    await fireEvent.changeText(
      screen.getByTestId('qf-cadrage-subject'),
      '  SAP S/4HANA Finance  ',
    );
    expectMinTouchTarget(screen.getByTestId('qf-cadrage-start'), { height: 44 });
    await fireEvent.press(screen.getByTestId('qf-cadrage-start'));

    await waitFor(() => {
      expect(mockApi.formationsCreate).toHaveBeenCalledWith(
        { body: { title: 'SAP S/4HANA Finance' } },
        { idempotencyKey: expect.any(String) as string },
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('qf-cadrage-input')).toBeTruthy();
    });
    expect(screen.getByText('Noté. Où en es-tu aujourd’hui ?')).toBeTruthy();
    expect(screen.queryByTestId('qf-cadrage-subject')).toBeNull();
  });
});