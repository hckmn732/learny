// Data of the daily warm-up (SPEC-3305 EF-5, ET-1; SPEC-714 ET-2, BR-AUT-03).
//
// The warm-up of the day is read once for the whole application (`['warmups', 'today']`, the key of
// SPEC-3201) and answered question by question. The answer route is idempotent: the key comes from
// the application registry so a retry or a replay never records the same position twice.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { WarmupDto, WarmupTodayDto } from '@learny/contracts';

import { idempotencyRegistry } from '../api/idempotency';
import { requireApiClient } from '../api/registry';

import { queryKeys } from './keys';

export type QueryStatus = 'loading' | 'error' | 'ready';

function statusOf(query: { readonly isError: boolean; readonly data: unknown }): QueryStatus {
  if (query.isError) return 'error';
  return query.data === undefined ? 'loading' : 'ready';
}

export interface WarmupsTodayQuery {
  readonly status: QueryStatus;
  readonly data: WarmupTodayDto | null;
  readonly refetch: () => Promise<void>;
}

/** Warm-ups of the day, one entry per formation (EF-5). */
export function useWarmupToday(): WarmupsTodayQuery {
  const query = useQuery({
    queryKey: queryKeys.warmupsToday(),
    queryFn: () => requireApiClient().api.warmupTodayGet({}),
    retry: 1,
  });
  return {
    status: statusOf(query),
    data: query.data ?? null,
    refetch: async () => {
      await query.refetch();
    },
  };
}

export interface WarmupAnswerVariables {
  readonly activityId: string;
  readonly position: number;
  readonly knew: boolean;
}

/** `POST /warmups/:activityId/answers` — « Je savais » (true) or « À revoir » (false). */
export function useWarmupAnswer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: WarmupAnswerVariables): Promise<WarmupDto> => {
      const intent = `warmup:${variables.activityId}:${String(variables.position)}`;
      return requireApiClient()
        .api.warmupAnswer(
          {
            params: { activityId: variables.activityId },
            body: { position: variables.position, knew: variables.knew },
          },
          { idempotencyKey: idempotencyRegistry.keyFor(intent) },
        )
        .then((result) => {
          idempotencyRegistry.resolve(intent);
          return result;
        });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.warmupsToday() });
    },
  });
}
