// Jest + RNTL [SPEC-3201] — fiche « Reporter la séance » (EF-3, CA-3, CL-4).
//
// The sheet reads the three windows of the server, then posts the move with the version it
// received; without a window it offers the agenda instead (CL-4) and a failed move shows the French
// message of the API error.
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LaterSheet } from '../../src/features/aujourdhui/TodaySheets';

const mockMove = jest.fn();
const mockAlternatives = {
  value: {
    status: 'ready' as string,
    data: null as unknown,
  },
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('../../src/data/home', () => ({
  useSlotAlternatives: () => ({ ...mockAlternatives.value, refetch: jest.fn() }),
  useSlotMove: () => ({ move: mockMove, pending: false }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const ALTERNATIVES = {
  slotId: 's-quiz',
  version: 'v1',
  timezone: 'Europe/Paris',
  durationMinutes: 40,
  day: '2026-11-11',
  alternatives: [
    {
      date: '2026-11-12',
      startsAt: '2026-11-12T09:30:00.000Z',
      endsAt: '2026-11-12T10:10:00.000Z',
      startMinutes: 630,
      endMinutes: 670,
      moment: 'matin',
      reasons: ['Marge libre'],
    },
    {
      date: '2026-11-12',
      startsAt: '2026-11-12T12:00:00.000Z',
      endsAt: '2026-11-12T12:40:00.000Z',
      startMinutes: 780,
      endMinutes: 820,
      moment: 'apres_midi',
      reasons: ['Marge libre'],
    },
    {
      date: '2026-11-13',
      startsAt: '2026-11-13T12:00:00.000Z',
      endsAt: '2026-11-13T12:40:00.000Z',
      startMinutes: 780,
      endMinutes: 820,
      moment: 'apres_midi',
      reasons: ['Marge libre'],
    },
  ],
};

async function renderSheet(
  overrides: {
    readonly onMoved?: (label: string) => void;
    readonly onOpenAgenda?: () => void;
  } = {},
): Promise<Awaited<ReturnType<typeof render>>> {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <LaterSheet
        visible
        onClose={jest.fn()}
        slotId="s-quiz"
        timeZone="Europe/Paris"
        online
        onMoved={overrides.onMoved ?? jest.fn()}
        onOpenAgenda={overrides.onOpenAgenda ?? jest.fn()}
      />
    </SafeAreaProvider>,
  );
}

describe('[SPEC-3201] fiche « Reporter la séance »', () => {
  beforeEach(() => {
    mockMove.mockReset();
    mockAlternatives.value = { status: 'ready', data: ALTERNATIVES };
  });

  it('propose les trois créneaux du serveur (EF-3)', async () => {
    const view = await renderSheet();
    expect(view.getByTestId('later-sheet')).toBeTruthy();
    expect(view.getByTestId('later-slot-0')).toBeTruthy();
    expect(view.getByTestId('later-slot-1')).toBeTruthy();
    expect(view.getByTestId('later-slot-2')).toBeTruthy();
    expect(view.getByText('jeu. 12 nov. 10:30')).toBeTruthy();
    expect(view.getByText('jeu. 12 nov. 13:00')).toBeTruthy();
  });

  it('déplace la séance avec la version reçue (CA-3)', async () => {
    mockMove.mockResolvedValue({ movedSlot: {}, explanation: 'ok' });
    const onMoved = jest.fn();
    const view = await renderSheet({ onMoved });
    await fireEvent.press(view.getByTestId('later-slot-0'));
    await waitFor(() => {
      expect(mockMove).toHaveBeenCalledWith({
        slotId: 's-quiz',
        expectedVersion: 'v1',
        startsAt: '2026-11-12T09:30:00.000Z',
        endsAt: '2026-11-12T10:10:00.000Z',
      });
    });
    await waitFor(() => {
      expect(onMoved).toHaveBeenCalledWith('jeu. 12 nov. 10:30');
    });
  });

  it('affiche un message français quand le déplacement échoue (EF-5)', async () => {
    mockMove.mockRejectedValue(new Error('boom'));
    const view = await renderSheet();
    await fireEvent.press(view.getByTestId('later-slot-1'));
    await waitFor(() => {
      expect(view.getByTestId('later-error')).toBeTruthy();
    });
  });

  it('propose l’agenda quand aucun créneau n’est libre (CL-4)', async () => {
    mockAlternatives.value = { status: 'ready', data: { ...ALTERNATIVES, alternatives: [] } };
    const onOpenAgenda = jest.fn();
    const view = await renderSheet({ onOpenAgenda });
    expect(view.getByTestId('later-empty')).toBeTruthy();
    expect(view.getByText('Aucun créneau libre cette semaine')).toBeTruthy();
    await fireEvent.press(view.getByText('Ouvrir l’agenda'));
    expect(onOpenAgenda).toHaveBeenCalledTimes(1);
  });
});
