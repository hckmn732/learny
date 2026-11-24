// Pause globale du compte (SPEC-3401 ET-1 ; BR-AUT-10, SPEC-721 ; canevas § 4).
//
// `GET /me/pause` is the state the banner of the Profil screen reads. Starting a pause freezes the
// planning server-side; resuming offers the ten-minute diagnostic (CL-5 of SPEC-721). Both writes
// are idempotent routes: one key per intention, forgotten once the server answered.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { PauseStateDto } from '@learny/contracts';

import { idempotencyRegistry } from '../api/idempotency';
import { requireApiClient } from '../api/registry';

import { queryKeys } from './keys';
import type { SettingsStatus } from './profile';

export interface PauseQuery {
  readonly status: SettingsStatus;
  readonly data: PauseStateDto | null;
  readonly refetch: () => void;
}

/** Current or latest pause of the learner and its return diagnostic (BR-AUT-10). */
export function usePause(): PauseQuery {
  const query = useQuery({
    queryKey: queryKeys.pause(),
    queryFn: () => requireApiClient().api.mePauseGet({}),
    retry: 1,
  });
  return {
    status: query.isError ? 'error' : query.data === undefined ? 'loading' : 'ready',
    data: query.data ?? null,
    refetch: () => {
      void query.refetch();
    },
  };
}

export interface PauseActions {
  /** Declares a pause until `endDate` (civil day of the learner zone). */
  readonly start: (endDate: string, diagnosticEnabled: boolean) => Promise<PauseStateDto>;
  /** Resumes now; the server answers the state, diagnostic included (CL-5). */
  readonly end: () => Promise<PauseStateDto>;
  readonly pending: boolean;
}

/** `POST /me/pause` and `DELETE /me/pause` (BR-AUT-10, EF-5). */
export function usePauseActions(): PauseActions {
  const client = useQueryClient();
  const start = useMutation({
    mutationFn: (input: { endDate: string; diagnosticEnabled: boolean }) => {
      const intent = `pause:start:${input.endDate}`;
      return requireApiClient()
        .api.mePauseStart(
          { body: { endDate: input.endDate, diagnosticEnabled: input.diagnosticEnabled } },
          { idempotencyKey: idempotencyRegistry.keyFor(intent) },
        )
        .then((state) => {
          idempotencyRegistry.resolve(intent);
          return state;
        });
    },
  });
  const end = useMutation({
    mutationFn: () => requireApiClient().api.mePauseEnd({}),
  });

  const publish = (state: PauseStateDto): PauseStateDto => {
    client.setQueryData(queryKeys.pause(), state);
    // A pause freezes or replans the future slots: every planning read is stale (§ 4 of the canvas).
    void client.invalidateQueries({ queryKey: ['home'] });
    void client.invalidateQueries({ queryKey: ['agenda'] });
    void client.invalidateQueries({ queryKey: ['streak'] });
    return state;
  };

  return {
    start: async (endDate, diagnosticEnabled) =>
      publish(await start.mutateAsync({ endDate, diagnosticEnabled })),
    end: async () => publish(await end.mutateAsync()),
    pending: start.isPending || end.isPending,
  };
}

/** True while the learner is on a pause (the banner and the resume action of the Profil tab). */
export function isPauseActive(state: PauseStateDto | null): boolean {
  return state?.status === 'active';
}
