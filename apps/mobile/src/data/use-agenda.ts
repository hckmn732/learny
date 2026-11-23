// Reads and mutations of the agenda (SPEC-3203 ET-1, ET-3, EF-7, CL-1, CL-4; canevas § 4).
//
// One query key per period and per filter, as the web does; a move invalidates `['agenda']` and
// `['home']` so that Aujourd'hui reflects the change (ET-3, CA-4). The server computes every
// period, status and destination; this module only carries the parameters and the answers.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AgendaDto, SlotAlternativesDto, SlotMoveOutput } from '@learny/contracts';

import { requireApiClient } from '../api/registry';

import { queryKeys } from './keys';

/** State of a read, as the screens display it (skeleton, error, content). */
export type QueryStatus = 'loading' | 'error' | 'ready';

function statusOf(query: { readonly isError: boolean; readonly data: unknown }): QueryStatus {
  if (query.isError) return 'error';
  return query.data === undefined ? 'loading' : 'ready';
}

export interface AgendaQuery {
  readonly status: QueryStatus;
  readonly data: AgendaDto | null;
  readonly retry: () => void;
}

/** Slots, bounds and totals of a civil window in the zone of the learner (ET-1). */
export function useAgenda(period: {
  readonly from: string;
  readonly to: string;
  readonly formation: string;
}): AgendaQuery {
  const query = useQuery({
    queryKey: queryKeys.agenda(period.from, period.to, period.formation),
    queryFn: () =>
      requireApiClient().api.agendaGet({
        query: { from: period.from, to: period.to, formation: period.formation },
      }),
    retry: 1,
  });
  return {
    status: statusOf(query),
    data: query.data ?? null,
    retry: () => {
      void query.refetch();
    },
  };
}

export interface SlotAlternativesQuery {
  readonly status: QueryStatus;
  readonly data: SlotAlternativesDto | null;
  readonly retry: () => void;
}

/** The three next compatible windows of a future slot (EF-7, BR-AGE-05). */
export function useSlotAlternatives(
  slotId: string | null,
  enabled: boolean,
): SlotAlternativesQuery {
  const query = useQuery({
    queryKey: queryKeys.slotAlternatives(slotId ?? 'none'),
    queryFn: () => requireApiClient().api.slotAlternativesGet({ params: { sid: slotId ?? '' } }),
    enabled: enabled && slotId !== null,
    // A conflict (CL-1) must show fresh proposals: the sheet always re-reads.
    staleTime: 0,
    retry: 1,
  });
  return {
    status: slotId === null ? 'loading' : statusOf(query),
    data: query.data ?? null,
    retry: () => {
      void query.refetch();
    },
  };
}

/** Variables of a move: the slot, the version read, the chosen window and its key (ET-3). */
export interface MoveSlotVariables {
  readonly slotId: string;
  readonly expectedVersion: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly idempotencyKey: string;
}

export interface MoveSlotMutation {
  readonly move: (variables: MoveSlotVariables) => Promise<SlotMoveOutput>;
  readonly pending: boolean;
  readonly reset: () => void;
}

/** `POST /slots/:sid/move`, then `['agenda']` and `['home']` invalidated (ET-3, CA-4). */
export function useMoveSlot(): MoveSlotMutation {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (variables: MoveSlotVariables) =>
      // `slotMove` is an idempotent route: the key is sent as is, so a 401 replay or a network
      // retry never moves the activity twice (BR-PLA-08, ET-3).
      requireApiClient().api.slotMove(
        {
          params: { sid: variables.slotId },
          body: {
            expectedVersion: variables.expectedVersion,
            startsAt: variables.startsAt,
            endsAt: variables.endsAt,
          },
        },
        { idempotencyKey: variables.idempotencyKey },
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['agenda'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.home() }),
      ]);
    },
  });
  return {
    move: mutation.mutateAsync,
    pending: mutation.isPending,
    reset: mutation.reset,
  };
}
