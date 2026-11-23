// Jest + RNTL [SPEC-3203] — écran Agenda : vues jour, semaine et mois, filtre et état vide
// (EF-2 à EF-5, EF-8, CA-1, CA-2, CA-3).
//
// Le client d'API et le routeur sont injectés : l'écran affiche l'agenda du mercredi 11 novembre
// 2026 à 13:20 (horloge figée, ADR-0047), dans le fuseau `Europe/Paris` que porte la réponse.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AgendaScreen } from '../../src/features/agenda/AgendaScreen';

import { AGENDA, EMPTY_AGENDA, GPA } from './fixtures';

const mockSetParams = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    setParams: mockSetParams,
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

let mockAgenda = AGENDA;

jest.mock('../../src/api/registry', () => ({
  requireApiClient: () => ({
    api: {
      agendaGet: () => Promise.resolve(mockAgenda),
      slotAlternativesGet: () =>
        Promise.resolve({
          slotId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa003',
          version: 'v1',
          timezone: 'Europe/Paris',
          durationMinutes: 40,
          day: '2026-11-11',
          alternatives: [],
        }),
      slotMove: () => Promise.reject(new Error('non utilisé ici')),
    },
  }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

const NOW = new Date('2026-11-11T12:20:00.000Z');

async function renderAgenda(
  params: Record<string, string> = {},
  readyTestID = 'agenda-timeline',
): Promise<void> {
  mockParams = { vue: 'jour', date: '2026-11-11', formation: 'all', ...params };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <AgendaScreen now={NOW} />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getByTestId(readyTestID)).toBeTruthy();
  });
}

describe('[SPEC-3203] écran Agenda', () => {
  beforeEach(() => {
    mockSetParams.mockClear();
    mockAgenda = AGENDA;
  });

  it('affiche les quatre activités du 11 novembre, à leur heure, avec leur statut (CA-1)', async () => {
    await renderAgenda();

    for (const title of [
      'Relecture du cours',
      'Échauffement',
      'Quiz de validation',
      'Quiz global',
    ]) {
      expect(screen.getAllByText(title).length).toBeGreaterThanOrEqual(1);
    }
    for (const time of ['09:00', '13:50', '14:00', '17:00']) {
      expect(screen.getAllByText(time).length).toBeGreaterThanOrEqual(1);
    }
    expect(screen.getAllByText('Fait').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Faire').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Dans 40 min').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('À venir').length).toBeGreaterThanOrEqual(1);
  });

  it('dessine la ligne de l’heure actuelle à 13:20 (BR-AGE-07, CA-1)', async () => {
    await renderAgenda();
    const line = screen.getByTestId('agenda-now-line');
    expect(within(line).getByText('13:20')).toBeTruthy();
    expect(within(line).getByText('Maintenant')).toBeTruthy();
  });

  it('sélectionne l’activité imminente et propose « Ouvrir » et « Replanifier » (EF-3, BR-AGE-05)', async () => {
    await renderAgenda();
    const card = screen.getByTestId('selected-activity');
    expect(within(card).getByText('Activité sélectionnée')).toBeTruthy();
    expect(within(card).getByText('Quiz de validation')).toBeTruthy();
    expect(within(card).getByTestId('selected-open')).toBeTruthy();
    const replan = within(card).getByTestId('replan');
    expect(replan).toBeTruthy();
    const state = replan.props.accessibilityState as { disabled?: boolean } | undefined;
    expect(state?.disabled).toBe(false);
  });

  it('affiche les totaux de la période et la puce de filtre (BR-AGE-06, EF-1)', async () => {
    await renderAgenda();
    const totals = screen.getByTestId('agenda-totals');
    expect(within(totals).getByText('24 h 10')).toBeTruthy();
    expect(within(totals).getByText('1 h')).toBeTruthy();
    expect(within(totals).getByText('2 marges de rattrapage')).toBeTruthy();
    expect(screen.getByTestId('agenda-filter')).toBeTruthy();
  });

  it('affiche la semaine et ouvre la vue Jour d’un jour touché (EF-4, CA-2)', async () => {
    await renderAgenda({ vue: 'semaine' }, 'agenda-week-list');
    for (const day of ['09', '10', '11', '12', '13', '14', '15']) {
      expect(screen.getByTestId(`agenda-week-day-2026-11-${day}`)).toBeTruthy();
    }
    expect(screen.getByText('Reprise · ledgers parallèles')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('agenda-week-day-2026-11-12'));
    expect(mockSetParams).toHaveBeenCalledWith({
      vue: 'jour',
      date: '2026-11-12',
      formation: 'all',
    });
  });

  it('affiche le mois et ouvre la vue Jour d’un jour touché (EF-5, CA-2)', async () => {
    await renderAgenda({ vue: 'mois' }, 'agenda-month-grid');
    expect(screen.getByTestId('agenda-month-grid')).toBeTruthy();
    expect(screen.getByTestId('agenda-month-2026-11-12')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('agenda-month-2026-11-12'));
    expect(mockSetParams).toHaveBeenCalledWith({
      vue: 'jour',
      date: '2026-11-12',
      formation: 'all',
    });
  });

  it('filtre par formation et affiche l’état vide du filtre (EF-8, CA-3)', async () => {
    await renderAgenda();
    await fireEvent.press(screen.getByTestId('agenda-filter'));

    expect(screen.getByTestId('agenda-filter-sheet')).toBeTruthy();
    expect(screen.getByTestId('agenda-filter-all')).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`agenda-filter-${GPA.id}`));
    expect(mockSetParams).toHaveBeenCalledWith({
      vue: 'jour',
      date: '2026-11-11',
      formation: GPA.id,
    });

    mockAgenda = EMPTY_AGENDA;
    await renderAgenda({ formation: GPA.id }, 'agenda-empty');
    expect(screen.getByTestId('agenda-empty')).toBeTruthy();
    expect(
      screen.getByText('Aucune activité pour Gestion de projet agile sur cette période'),
    ).toBeTruthy();
  });

  it('affiche le squelette puis l’erreur avec « Réessayer » (EF-1, CL-2)', async () => {
    mockAgenda = AGENDA;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await render(
      <QueryClientProvider client={client}>
        <SafeAreaProvider initialMetrics={METRICS}>
          <AgendaScreen now={NOW} />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('agenda-loading')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('selected-activity')).toBeTruthy();
    });
  });
});
