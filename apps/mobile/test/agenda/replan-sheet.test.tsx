// Jest + RNTL [SPEC-3203] — feuille de replanification : trois créneaux, confirmation et conflit
// (EF-7, BR-AGE-05, CA-4, CL-1, CL-4).
//
// Le client d'API est injecté : les propositions viennent du planificateur, et la mutation porte la
// version lue et la clé d'idempotence de l'intention (ET-3, BR-PLA-08).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppError } from '@learny/core';

import { ReplanSheet } from '../../src/features/agenda/ReplanSheet';

import { ALTERNATIVES, MOVED, QUIZ_SLOT } from './fixtures';

const mockMove = jest.fn<Promise<unknown>, [unknown, unknown]>();
const mockOpenOnWeb = jest.fn((path: string) => Promise.resolve(`https://learny.test${path}`));
let mockAlternatives: typeof ALTERNATIVES | null = ALTERNATIVES;

jest.mock('../../src/api/registry', () => ({
  requireApiClient: () => ({
    api: {
      slotAlternativesGet: () =>
        mockAlternatives === null
          ? Promise.reject(new Error('planificateur indisponible'))
          : Promise.resolve(mockAlternatives),
      slotMove: (input: unknown, options: unknown) => mockMove(input, options),
      agendaGet: () => Promise.reject(new Error('non utilisé ici')),
    },
  }),
}));

jest.mock('../../src/lib/web', () => ({
  openOnWeb: (path: string) => mockOpenOnWeb(path),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

const onClose = jest.fn();
const onMoved = jest.fn();
const onConflict = jest.fn();

interface Options {
  readonly online?: boolean;
  readonly visible?: boolean;
}

async function renderSheet({ online = true, visible = true }: Options = {}): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <ReplanSheet
          slot={QUIZ_SLOT}
          visible={visible}
          online={online}
          onClose={onClose}
          onMoved={onMoved}
          onConflict={onConflict}
        />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

describe('[SPEC-3203] feuille de replanification', () => {
  beforeEach(() => {
    mockMove.mockReset();
    mockOpenOnWeb.mockClear();
    onClose.mockClear();
    onMoved.mockClear();
    onConflict.mockClear();
    mockAlternatives = ALTERNATIVES;
  });

  it('propose les trois créneaux du planificateur (EF-7, CA-4)', async () => {
    await renderSheet();
    await waitFor(() => {
      expect(screen.getByTestId('replan-option-0')).toBeTruthy();
    });
    expect(screen.getAllByTestId(/^replan-option-/)).toHaveLength(3);
    expect(screen.getByText('jeu. 12 nov. · 09:00 – 09:40')).toBeTruthy();
    expect(screen.getByText('jeu. 12 nov. · 14:00 – 14:40')).toBeTruthy();
    expect(screen.getByText('jeu. 12 nov. · 19:00 – 19:40')).toBeTruthy();
    expect(screen.getByText('Matin')).toBeTruthy();
    expect(screen.getByText('Après-midi')).toBeTruthy();
    expect(screen.getByText('Soir')).toBeTruthy();
  });

  it('demande confirmation puis déplace avec la version lue et une clé d’idempotence (ET-3)', async () => {
    mockMove.mockResolvedValue(MOVED);
    await renderSheet();
    await waitFor(() => {
      expect(screen.getByTestId('replan-option-1')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('replan-option-1'));
    const block = screen.getByTestId('replan-confirm-block');
    expect(within(block).getByText('Replanifier au jeu. 12 nov. · 14:00 ?')).toBeTruthy();
    expect(mockMove).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('replan-confirm'));
    await waitFor(() => {
      expect(onMoved).toHaveBeenCalledWith(MOVED);
    });

    const [input, options] = mockMove.mock.calls[0] as [
      {
        params: { sid: string };
        body: { expectedVersion: string; startsAt: string; endsAt: string };
      },
      { idempotencyKey: string },
    ];
    expect(input.params.sid).toBe(QUIZ_SLOT.id);
    expect(input.body).toEqual({
      expectedVersion: 'version-1',
      startsAt: '2026-11-12T13:00:00.000Z',
      endsAt: '2026-11-12T13:40:00.000Z',
    });
    expect(options.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sur conflit, abandonne le choix, relit les propositions et prévient (CL-1)', async () => {
    mockMove.mockRejectedValue(new AppError('CONFLICT', 'Ce créneau vient de changer.'));
    await renderSheet();
    await waitFor(() => {
      expect(screen.getByTestId('replan-option-0')).toBeTruthy();
    });

    await fireEvent.press(screen.getByTestId('replan-option-0'));
    await fireEvent.press(screen.getByTestId('replan-confirm'));

    await waitFor(() => {
      expect(onConflict).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId('replan-confirm-block')).toBeNull();
    expect(onMoved).not.toHaveBeenCalled();
  });

  it('explique l’absence de créneau et renvoie sur le web (EF-7)', async () => {
    mockAlternatives = { ...ALTERNATIVES, alternatives: [] };
    await renderSheet();
    await waitFor(() => {
      expect(screen.getByTestId('replan-empty')).toBeTruthy();
    });
    expect(screen.getByText('Aucun créneau disponible')).toBeTruthy();
    await fireEvent.press(screen.getByText('Continuer sur le web'));
    expect(mockOpenOnWeb).toHaveBeenCalledWith('/agenda');
  });

  it('reste fermé aux propositions hors ligne et l’annonce (CL-4)', async () => {
    await renderSheet({ online: false });
    expect(screen.getByTestId('replan-offline')).toBeTruthy();
    expect(screen.queryByTestId('replan-option-0')).toBeNull();
  });
});
