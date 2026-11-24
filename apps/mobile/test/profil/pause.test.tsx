// Jest + RNTL [SPEC-3401] — feuille de pause (EF-5, CA-4 ; BR-AUT-10).
//
// The proposals start tomorrow (CL-3 of SPEC-721), the chosen day is sent as a civil day of the
// learner zone, and an active pause offers « Reprendre maintenant » (DELETE /me/pause).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PauseSheet } from '../../src/features/profil/PauseSheet';

import { PAUSE as mockPauseIdle, PAUSE_ACTIVE as mockPauseRunning } from './fixtures';

const NOW = new Date('2026-11-11T12:20:00.000Z');
const mockStart = jest.fn();
const mockEnd = jest.fn();
let mockPause = mockPauseIdle;

jest.mock('../../src/api/registry', () => ({
  requireApiClient: () => ({
    api: {
      mePauseGet: () => Promise.resolve(mockPause),
      mePauseStart: mockStart,
      mePauseEnd: mockEnd,
    },
  }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

/** Premier argument d'une mutation espionnée, sans `any` : `jest.Mock` l'expose. */
function firstCall(mock: jest.Mock): Record<string, unknown> {
  const calls = mock.mock.calls as unknown as [Record<string, unknown>][];
  const argument = calls[0]?.[0];
  if (argument === undefined) throw new Error('mutation non appelée');
  return argument;
}

async function renderSheet(onDone = jest.fn(), onClose = jest.fn()): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <PauseSheet visible onClose={onClose} onDone={onDone} timeZone="Europe/Paris" now={NOW} />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => {
    expect(screen.getByTestId('pause-date')).toBeTruthy();
  });
}

describe('[SPEC-3401] feuille de pause', () => {
  beforeEach(() => {
    mockPause = mockPauseIdle;
    mockStart.mockReset();
    mockStart.mockImplementation((input: { body: { endDate: string } }) =>
      Promise.resolve({ ...mockPauseRunning, endsOn: input.body.endDate }),
    );
    mockEnd.mockReset();
    mockEnd.mockImplementation(() => Promise.resolve({ ...mockPauseIdle, status: 'ended' }));
  });

  it('propose des dates bornées, demain au plus tôt (EF-5, CL-3)', async () => {
    await renderSheet();
    expect(screen.getByTestId('pause-date-1')).toHaveTextContent(/Jeudi 12 novembre/u);
    expect(screen.getByTestId('pause-date-30')).toBeTruthy();
    expect(screen.queryByTestId('pause-date-0')).toBeNull();
  });

  it('met le compte en pause jusqu’à la date choisie (CA-4)', async () => {
    const onDone = jest.fn();
    await renderSheet(onDone);
    await fireEvent.press(screen.getByTestId('pause-date-7'));
    await fireEvent.press(screen.getByTestId('pause-confirm'));
    await waitFor(() => {
      expect(mockStart).toHaveBeenCalledTimes(1);
    });
    const call = firstCall(mockStart);
    expect(call.body).toEqual({ endDate: '2026-11-18', diagnosticEnabled: true });
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledWith(
        expect.stringMatching(/Pause programmée jusqu’au Mercredi 18 novembre/u),
      );
    });
  });

  it('suit le diagnostic au retour (BR-AUT-10)', async () => {
    await renderSheet();
    await fireEvent(screen.getByTestId('pause-diagnostic-control'), 'valueChange', false);
    await fireEvent.press(screen.getByTestId('pause-confirm'));
    await waitFor(() => {
      expect(mockStart).toHaveBeenCalledTimes(1);
    });
    const call = firstCall(mockStart);
    expect(call.body).toMatchObject({ diagnosticEnabled: false });
  });

  it('reprend immédiatement une pause active (CA-4)', async () => {
    mockPause = mockPauseRunning;
    const onDone = jest.fn();
    await renderSheet(onDone);
    await waitFor(() => {
      expect(screen.getByTestId('pause-resume')).toBeTruthy();
    });
    await fireEvent.press(screen.getByTestId('pause-resume'));
    await waitFor(() => {
      expect(mockEnd).toHaveBeenCalledTimes(1);
    });
    expect(onDone).toHaveBeenCalledWith(
      expect.stringMatching(/Pause terminée : le planning reprend/u),
    );
  });

  it('affiche l’erreur du serveur quand la pause échoue (EF-5)', async () => {
    mockStart.mockImplementation(() => Promise.reject(new Error('réseau')));
    await renderSheet();
    await fireEvent.press(screen.getByTestId('pause-confirm'));
    await waitFor(() => {
      expect(screen.getByTestId('pause-error')).toHaveTextContent(
        /La pause n’a pas pu être enregistrée\. Réessayez\./u,
      );
    });
  });
});
