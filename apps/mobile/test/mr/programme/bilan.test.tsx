// Jest + RNTL — écran Bilan final (zone A du rattrapage mobile).
//
// The result, the strong points, the fragile notions and the memory interview are read from one
// DTO; the only action asserted here is the choice of the interview mode, which posts the route
// of the web.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { FinalReviewDto } from '@learny/contracts';

import { BilanScreen } from '../../../src/features/mr/programme/BilanScreen';

const FORMATION = '2b7c9d1e-8888-4a4a-8a8a-121212121212';

const BILAN: FinalReviewDto = {
  formationId: FORMATION,
  formationTitle: 'SAP S/4HANA Finance',
  monogram: 'SF',
  accent: 'indigo',
  status: 'completed',
  programVersion: 3,
  completedAt: '2026-11-20T17:00:00.000Z',
  completedOn: '2026-11-20',
  weeks: 9,
  timezone: 'Europe/Paris',
  stats: {
    masteredNotions: 48,
    fragileNotions: 1,
    totalNotions: 48,
    completedMinutes: 2_040,
    resultPercent: 86,
  },
  retention: { oneMonth: 82, twoMonths: null },
  gaps: [
    {
      notionId: '3c8d0e2f-9999-4b4b-9b9b-131313131313',
      label: 'Clôture mensuelle',
      nature: 'forgetting',
      natureLabel: 'Oubli',
      evidence: 'Deux erreurs sur le dernier quiz global.',
      mastery: 55,
      moduleId: '4d9e1f3a-aaaa-4c4c-8c8c-141414141414',
      modulePosition: 4,
      moduleTitle: 'Clôture',
      trainingHref: '/quiz-global',
    },
  ],
  modules: [
    {
      moduleId: '4d9e1f3a-aaaa-4c4c-8c8c-141414141414',
      position: 1,
      title: 'Écritures',
      threshold: 80,
      masteredCount: 12,
      notions: [],
    },
  ],
  dueCount: 3,
  maintenance: { mode: 'light', dailyMinutes: 5, dueOnly: true, reminders: true },
  milestones: [],
  mapHref: '/formations/2b7c9d1e-8888-4a4a-8a8a-121212121212/carte',
  updatedAt: '2026-11-20T17:00:00.000Z',
  generatedAt: '2026-11-25T12:20:00.000Z',
};

const mockSetMaintenance = jest.fn();

jest.mock('../../../src/api/registry', () => ({
  requireApiClient: () => ({
    api: {
      getFinalReview: () => Promise.resolve(BILAN),
      setMaintenance: (input: unknown) => {
        mockSetMaintenance(input);
        return Promise.resolve({
          ...BILAN,
          dueCount: 0,
          maintenance: { mode: 'stopped', dailyMinutes: 5, dueOnly: true, reminders: false },
        });
      },
    },
  }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

async function renderBilan(): Promise<void> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <BilanScreen formationId={FORMATION} onBack={jest.fn()} onOpenMap={jest.fn()} />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getByText('SAP S/4HANA Finance')).toBeTruthy();
  });
}

describe('écran Bilan final', () => {
  beforeEach(() => {
    mockSetMaintenance.mockClear();
  });

  it('affiche le résultat, les points forts et la notion fragile', async () => {
    await renderBilan();

    expect(screen.getByTestId('qf-bilan')).toBeTruthy();
    expect(screen.getByText('86 %')).toBeTruthy();
    expect(screen.getByText('Points forts')).toBeTruthy();
    expect(screen.getByText('12 notions solides · Écritures')).toBeTruthy();
    expect(screen.getByText('Clôture mensuelle')).toBeTruthy();
    expect(screen.getByText('3 notions dues aujourd’hui.')).toBeTruthy();
  });

  it('change l’entretien de mémoire (action principale)', async () => {
    await renderBilan();

    await fireEvent.press(screen.getByTestId('qf-bilan-maintenance-stopped'));

    await waitFor(() => {
      expect(mockSetMaintenance).toHaveBeenCalledWith({
        params: { fid: FORMATION },
        body: { mode: 'stopped', expectedUpdatedAt: '2026-11-20T17:00:00.000Z' },
      });
    });
  });

  it('annonce que l’attestation n’est pas encore disponible', async () => {
    await renderBilan();

    await fireEvent.press(screen.getByTestId('qf-bilan-attestation'));

    await waitFor(() => {
      expect(screen.getByText('L’attestation n’est pas encore disponible sur mobile.')).toBeTruthy();
    });
  });
});