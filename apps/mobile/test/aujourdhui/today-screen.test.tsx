// Jest + RNTL [SPEC-3201] — rendu de l'écran Aujourd'hui, états et accessibilité (CA-1, CA-2, EF-8).
//
// The data layer is mocked: the screen is rendered with the demonstration dataset of 13:20 and the
// assertions pin the texts of the mockup, the destinations of the actions, the empty, error and
// loading states and the announced labels of the cards.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AutomationActionItem, HomeDto, StreakDto } from '@learny/contracts';

import { TodayScreen } from '../../src/features/aujourdhui/TodayScreen';
import { expectAccessible } from '../utils/expectAccessible';

const mockPush = jest.fn();
const mockOpenOnWeb = jest.fn((path: string) => Promise.resolve(`https://learny.test${path}`));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  // The screen is the focused tab of the test: the real hook registers a focus listener, the mock
  // only keeps the default `focused = true` (calling the effect during render would loop).
  useFocusEffect: () => undefined,
}));

// The injected clock of the campaign: 2026-11-11T12:20:00Z, i.e. 13:20 in Paris (ADR-0047).
jest.mock('../../src/lib/clock', () => ({
  clock: { now: () => new Date('2026-11-11T12:20:00.000Z') },
  formatClockTime: () => '13:20',
  nowLabel: () => '13:20',
}));

jest.mock('../../src/lib/web', () => ({
  openOnWeb: (path: string) => mockOpenOnWeb(path),
}));

jest.mock('../../src/api/registry', () => ({
  requireApiClient: () => ({
    api: {
      headerGet: () =>
        Promise.resolve({
          firstName: 'Alex',
          lastName: 'Perrin',
          emailLabel: 'alex.perrin@exemple.fr',
          activeFormationCount: 3,
          unreadNotificationCount: 3,
        }),
      notificationsUnreadCount: () => Promise.resolve({ count: 3 }),
    },
  }),
}));

const mockHome: { value: { status: string; data: HomeDto | null; refreshing: boolean } } = {
  value: { status: 'ready', data: null, refreshing: false },
};
const mockStreak: { value: { status: string; data: StreakDto | null } } = {
  value: { status: 'ready', data: null },
};
const mockAutomations: {
  value: {
    status: string;
    pending: AutomationActionItem[];
    recent: AutomationActionItem[];
    weekCount: number;
  };
} = {
  value: { status: 'ready', pending: [], recent: [], weekCount: 5 },
};
const mockWarmups: { value: { status: string; data: unknown } } = {
  value: { status: 'ready', data: { items: [] } },
};
const mockGaps: { value: { status: string; data: unknown } } = {
  value: { status: 'ready', data: null },
};
const mockRun = jest.fn(() => Promise.resolve());

jest.mock('../../src/data/home', () => ({
  useHome: () => ({ ...mockHome.value, refetch: jest.fn() }),
  useStreak: () => ({ ...mockStreak.value, refetch: jest.fn() }),
  useAutomationActions: () => ({ ...mockAutomations.value, refetch: jest.fn() }),
  useWarmupsToday: () => ({ ...mockWarmups.value, refetch: jest.fn() }),
  useGaps: () => ({ ...mockGaps.value, refetch: jest.fn() }),
  useSlotAlternatives: () => ({ status: 'ready', data: null, refetch: jest.fn() }),
  useSlotMove: () => ({ move: jest.fn(), pending: false }),
  useTutorActions: () => ({ run: mockRun, pending: false }),
  useRefreshToday: () => jest.fn(),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

function slot(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 's-quiz',
    formationId: 'f-sap',
    kind: 'validation_quiz',
    title: 'Quiz de validation',
    meta: 'Tentative 2 · seuil 80 %',
    time: '14:00',
    moduleId: 'm-3',
    activityId: null,
    startsAt: '2026-11-11T13:00:00.000Z',
    endsAt: '2026-11-11T14:00:00.000Z',
    status: 'planned',
    state: 'next',
    minutesUntil: 40,
    href: '/formations/f-sap/modules/m-3/quiz',
    ...overrides,
  };
}

const HOME: HomeDto = {
  today: {
    date: '2026-11-11',
    label: 'Mercredi 11 novembre',
    plannedMinutes: 302,
    doneMinutes: 180,
    slots: [
      slot({
        id: 's-course',
        kind: 'course',
        title: 'Relecture ciblée',
        meta: 'Chapitre 2 et lacunes · fait',
        time: '09:00',
        startsAt: '2026-11-11T08:00:00.000Z',
        endsAt: '2026-11-11T11:00:00.000Z',
        status: 'done',
        state: 'done',
      }),
      slot({}),
      slot({
        id: 's-global',
        kind: 'global_quiz',
        title: 'Quiz global',
        meta: '14 notions · 10 min',
        time: '17:00',
        startsAt: '2026-11-11T16:00:00.000Z',
        endsAt: '2026-11-11T16:30:00.000Z',
        state: 'upcoming',
        href: '/formations/f-sap/quiz-global',
      }),
    ],
    primaryAction: { label: 'Commencer', href: '/formations/f-sap/modules/m-3/quiz' },
  },
  retention: { oneMonth: null, twoMonths: 0 },
  globalQuiz: null,
  formations: {
    ongoing: [
      {
        id: 'f-sap',
        monogram: 'SAP',
        accent: 'indigo',
        status: 'active',
        title: 'SAP S/4HANA Finance',
        subtitle: 'Être opérationnel',
        progressPercent: 29,
        modulePosition: 3,
        moduleCount: 7,
        moduleTitle: 'Comptabilité générale',
        moduleStatus: null,
        nextActivity: null,
        endDate: '2026-12-11',
        action: { label: 'Reprendre', href: '/formations/f-sap/modules/m-3' },
        primaryAction: true,
      },
    ],
    completed: [],
  },
} as unknown as HomeDto;

const STREAK: StreakDto = {
  days: 12,
  regularity: Array.from({ length: 14 }, (_, index) => ({
    date: `2026-11-${String(index + 1).padStart(2, '0')}`,
    status: index >= 2 ? ('done' as const) : ('none' as const),
  })),
  timezone: 'Europe/Paris',
  computedOn: '2026-11-11',
  nextMilestone: null,
};

const PENDING: AutomationActionItem = {
  id: 'a-1',
  automation: 'reprise',
  kind: 'reprise_proposed',
  summary: 'Reprise proposée jeudi 10:30.',
  formationId: 'f-sap',
  payload: {
    alternatives: [{ startsAt: '2026-11-12T09:30:00.000Z', endsAt: '2026-11-12T10:10:00.000Z' }],
  },
  undoPayload: null,
  requiresConsent: true,
  status: 'pending_consent',
  decidedAt: null,
  createdAt: '2026-11-11T07:05:00.000Z',
};

async function renderScreen(): Promise<Awaited<ReturnType<typeof render>>> {
  // The header of SPEC-3102 reads `/me/header` through TanStack Query: one client per test, no
  // retry and no garbage collector timer (a lingering cache keeps Jest alive).
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <TodayScreen />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

describe('[SPEC-3201] écran Aujourd’hui', () => {
  beforeEach(() => {
    mockHome.value = { status: 'ready', data: HOME, refreshing: false };
    mockStreak.value = { status: 'ready', data: STREAK };
    mockAutomations.value = { status: 'ready', pending: [], recent: [], weekCount: 5 };
    mockWarmups.value = { status: 'ready', data: { items: [] } };
    mockGaps.value = {
      status: 'ready',
      data: {
        summary: { openGaps: 4, masteredNotions: 23, gapModules: [2, 3], masteredModules: [1] },
        items: [],
      },
    };
    mockPush.mockClear();
    mockOpenOnWeb.mockClear();
    mockRun.mockClear();
  });

  it('affiche la séance, les heures et les trois indicateurs (CA-1)', async () => {
    const view = await renderScreen();
    expect(await view.findByTestId('today-hero')).toBeTruthy();
    expect(view.getByTestId('today-hero-title')).toHaveTextContent('Quiz de validation');
    expect(view.getByTestId('today-hero-time')).toHaveTextContent('14:00');
    expect(view.getByTestId('today-hero-detail')).toHaveTextContent(
      'Comptabilité générale · tentative 2 · seuil 80 %',
    );
    expect(view.getByTestId('today-hero-done')).toHaveTextContent('3 h faites');
    expect(view.getByTestId('today-hero-planned')).toHaveTextContent('5 h prévues');
    expect(view.getByTestId('today-hero-start')).toBeTruthy();
    expect(view.getByTestId('today-hero-later')).toBeTruthy();
    expect(view.getByTestId('stat-streak')).toBeTruthy();
    expect(view.getByTestId('stat-streak')).toHaveTextContent(/12/);
    expect(view.getByTestId('stat-gaps')).toHaveTextContent(/4/);
    expect(view.getByTestId('stat-retention')).toBeTruthy();
    expect(view.getByTestId('today-header-title')).toHaveTextContent('Aujourd’hui');
    expect(view.getByText('Mercredi 11 novembre')).toBeTruthy();
  });

  it('annonce la carte de la séance et les cartes d’indicateurs (accessibilité)', async () => {
    const view = await renderScreen();
    await view.findByTestId('today-hero');
    expectAccessible(view, 'today-hero-label', {
      label: 'Votre séance, Quiz de validation, 14:00',
    });
    expectAccessible(view, 'stat-streak', { role: 'button' });
    expectAccessible(view, 'stat-retention', { role: 'button' });
    expectAccessible(view, 'stat-gaps', { role: 'button' });
    expectAccessible(view, 'today-hero-start', { role: 'button', label: 'Commencer · 60 min' });
  });

  it('ouvre la séance sur le web tant que SPEC-3304 n’est pas livrée (CA-2, ADR-3002)', async () => {
    const view = await renderScreen();
    await view.findByTestId('today-hero-start');
    await fireEvent.press(view.getByTestId('today-hero-start'));
    await waitFor(() => {
      expect(mockOpenOnWeb).toHaveBeenCalledWith('/formations/f-sap/modules/m-3/quiz');
    });
    expect(view.getByTestId('today-toast-start')).toBeTruthy();
  });

  it('ouvre la fiche « Reporter la séance » (EF-3)', async () => {
    const view = await renderScreen();
    await view.findByTestId('today-hero-later');
    await fireEvent.press(view.getByTestId('today-hero-later'));
    expect(await view.findByTestId('later-sheet')).toBeTruthy();
  });

  it('affiche la suite du jour et l’échauffement (EF-2, EF-6, EF-7)', async () => {
    mockWarmups.value = {
      status: 'ready',
      data: {
        items: [
          {
            activityId: 'a-warmup',
            formationId: 'f-sap',
            nextSession: {
              kind: 'validation_quiz',
              startsAt: '2026-11-11T13:00:00.000Z',
              href: '/formations/f-sap/modules/m-3/quiz',
            },
            scope: 'yesterday_prerequisites',
            items: [{}, {}, {}],
            answers: [],
            status: 'todo',
          },
        ],
      },
    };
    const view = await renderScreen();
    await view.findByTestId('up-next');
    expect(view.getByText('À suivre')).toBeTruthy();
    expect(view.getByTestId('warmup-card')).toBeTruthy();
    expect(view.getByTestId('up-next-s-course')).toBeTruthy();
    await fireEvent.press(view.getByTestId('up-next-s-global'));
    expect(mockPush).toHaveBeenCalledWith('/reviser');
  });

  it('présente les actions du tuteur (EF-5)', async () => {
    mockAutomations.value = { status: 'ready', pending: [PENDING], recent: [], weekCount: 5 };
    const view = await renderScreen();
    await view.findByTestId('tutor-actions');
    expect(view.getByTestId('tutor-action-a-1')).toBeTruthy();
    await fireEvent.press(view.getByTestId('tutor-accept-0'));
    await waitFor(() => {
      expect(mockRun).toHaveBeenCalledWith({ id: 'a-1', action: 'accept' });
    });
  });

  it('affiche le squelette au premier chargement (EF-6)', async () => {
    mockHome.value = { status: 'loading', data: null, refreshing: false };
    const view = await renderScreen();
    expect(view.getByTestId('today-loading')).toBeTruthy();
  });

  it('propose « Réessayer » sur une erreur de chargement (EF-6)', async () => {
    mockHome.value = { status: 'error', data: null, refreshing: false };
    const view = await renderScreen();
    expect(view.getByTestId('today-error')).toBeTruthy();
    expect(view.getByTestId('today-error-retry')).toBeTruthy();
  });

  it('affiche « Rien de prévu aujourd’hui » sur une journée vide (EF-9)', async () => {
    mockHome.value = {
      status: 'ready',
      data: {
        ...HOME,
        today: { ...HOME.today, slots: [], plannedMinutes: 0, doneMinutes: 0 },
      },
      refreshing: false,
    };
    const view = await renderScreen();
    expect(view.getByTestId('today-empty')).toBeTruthy();
    expect(view.getByText('Rien de prévu aujourd’hui')).toBeTruthy();
  });

  it('affiche « Aucune formation active » sans formation (EF-7 de SPEC-3102)', async () => {
    mockHome.value = {
      status: 'ready',
      data: {
        ...HOME,
        formations: { ongoing: [], completed: [] },
        today: { ...HOME.today, slots: [] },
      },
      refreshing: false,
    };
    const view = await renderScreen();
    expect(view.getByTestId('today-no-formation')).toBeTruthy();
  });
});
