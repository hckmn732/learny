// Data of the Aujourd'hui screen (SPEC-3201 ET-1, ET-3, EF-5, CL-5; canevas § 4).
//
// One query key per read — `['home']`, `['streak']`, `['automation-actions']`, `['warmups','today']`
// — plus the two reads a sheet needs on demand: the open gaps of the current formation (fiche
// « Lacunes ») and the alternatives of the highlighted slot (fiche « Plus tard »).
//
// Every mutation is optimistic: the card changes at once, a failure puts the previous cache back
// (EF-5, « retour arrière en cas d'échec ») and a success always invalidates `['home']` and
// `['agenda']` (ET-3). The server decides every value; this module only transports it.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  AutomationActionItem,
  AutomationActionPageDto,
  GapListDto,
  HomeDto,
  SlotAlternativesDto,
  SlotMoveOutput,
  StreakDto,
  WarmupTodayDto,
} from '@learny/contracts';

import { requireApiClient } from '../api/registry';

import { queryKeys } from './keys';

export type DataStatus = 'loading' | 'error' | 'ready';

/** Status of a read, as the screens show it: a skeleton, an error or the data. */
export function statusOf(query: { readonly isError: boolean; readonly data: unknown }): DataStatus {
  if (query.isError) return 'error';
  return query.data === undefined ? 'loading' : 'ready';
}

export interface HomeQuery {
  readonly status: DataStatus;
  readonly data: HomeDto | null;
  /** True during a pull-to-refresh or a foreground refresh, never during the first read. */
  readonly refreshing: boolean;
  readonly refetch: () => void;
}

/** The day, its retention and the global quiz (`GET /home`). */
export function useHome(): HomeQuery {
  const query = useQuery({
    queryKey: queryKeys.home(),
    queryFn: () => requireApiClient().api.homeGet({}),
    retry: 1,
  });
  return {
    status: statusOf(query),
    data: query.data ?? null,
    refreshing: query.isFetching && query.data !== undefined,
    refetch: () => {
      void query.refetch();
    },
  };
}

export interface StreakQuery {
  readonly status: DataStatus;
  readonly data: StreakDto | null;
  readonly refetch: () => void;
}

/** Série and the fourteen local boxes (`GET /streak`, BR-GAM-01/02). */
export function useStreak(): StreakQuery {
  const query = useQuery({
    queryKey: queryKeys.streak(),
    queryFn: () => requireApiClient().api.streakGet({}),
    retry: 1,
  });
  return {
    status: statusOf(query),
    data: query.data ?? null,
    refetch: () => {
      void query.refetch();
    },
  };
}

export interface AutomationActionsQuery {
  readonly status: DataStatus;
  /** Proposals waiting for consent (« À faire », BR-AUT-13). */
  readonly pending: readonly AutomationActionItem[];
  /** Applied, consumed, declined or undone actions, newest first. */
  readonly recent: readonly AutomationActionItem[];
  /** BR-AUT-12 — « N actions cette semaine », computed by the server. */
  readonly weekCount: number;
  readonly refetch: () => void;
}

/** Journal of the automations (`GET /me/automation-actions`, BR-AUT-12/13). */
export function useAutomationActions(): AutomationActionsQuery {
  const query = useQuery({
    queryKey: queryKeys.automationActions(),
    queryFn: () => requireApiClient().api.meAutomationActionsList({ query: { limit: 20 } }),
    retry: 1,
  });
  const items = query.data?.items ?? [];
  return {
    status: statusOf(query),
    pending: items.filter((item) => item.status === 'pending_consent'),
    recent: items.filter((item) => item.status !== 'pending_consent'),
    weekCount: query.data?.weekCount ?? 0,
    refetch: () => {
      void query.refetch();
    },
  };
}

export interface WarmupsQuery {
  readonly status: DataStatus;
  readonly data: WarmupTodayDto | null;
  readonly refetch: () => void;
}

/** Warm-ups of the day, one entry per formation (`GET /warmups/today`, SPEC-714 EF-7). */
export function useWarmupsToday(): WarmupsQuery {
  const query = useQuery({
    queryKey: queryKeys.warmupsToday(),
    queryFn: () => requireApiClient().api.warmupTodayGet({}),
    retry: 1,
  });
  return {
    status: statusOf(query),
    data: query.data ?? null,
    refetch: () => {
      void query.refetch();
    },
  };
}

export interface GapsQuery {
  readonly status: DataStatus;
  readonly data: GapListDto | null;
  readonly refetch: () => void;
}

/** Open gaps of one formation (`GET /formations/:fid/gaps`, SPEC-615, BR-MEM-06 sheet). */
export function useGaps(formationId: string | null): GapsQuery {
  const query = useQuery({
    queryKey: queryKeys.gaps(formationId ?? 'none'),
    queryFn: () =>
      requireApiClient().api.gapsList({ params: { fid: formationId ?? '' }, query: {} }),
    enabled: formationId !== null,
    retry: 1,
  });
  return {
    status: statusOf(query),
    data: query.data ?? null,
    refetch: () => {
      void query.refetch();
    },
  };
}

export interface SlotAlternativesResult {
  readonly status: DataStatus;
  readonly data: SlotAlternativesDto | null;
  readonly refetch: () => void;
}

/** Three free windows of a future slot (`GET /slots/:sid/alternatives`, BR-AGE-05). */
export function useSlotAlternatives(slotId: string | null, enabled = true): SlotAlternativesResult {
  const query = useQuery({
    queryKey: queryKeys.slotAlternatives(slotId ?? 'none'),
    queryFn: () => requireApiClient().api.slotAlternativesGet({ params: { sid: slotId ?? '' } }),
    enabled: enabled && slotId !== null,
    retry: 1,
  });
  return {
    status: statusOf(query),
    data: query.data ?? null,
    refetch: () => {
      void query.refetch();
    },
  };
}

export type TutorActionKind = 'accept' | 'decline' | 'undo';

/** Status the optimistic cache writes before the server answers (EF-5). */
const OPTIMISTIC_STATUS = {
  accept: 'applied',
  decline: 'declined',
  undo: 'undone',
} as const satisfies Record<TutorActionKind, AutomationActionItem['status']>;

export interface TutorActionVariables {
  readonly id: string;
  readonly action: TutorActionKind;
  /** Body of `accept`; the reprise effect reads `choice.startsAt` (ADR-0190 § 3). */
  readonly choice?: Record<string, unknown>;
}

export interface TutorActions {
  /** Runs the action; answers the item the server returned. */
  readonly run: (variables: TutorActionVariables) => Promise<AutomationActionItem>;
  readonly pending: boolean;
}

/** Accept, decline and undo an automation action, optimistically (SPEC-3201 EF-5, CA-4). */
export function useTutorActions(): TutorActions {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (variables: TutorActionVariables): Promise<AutomationActionItem> => {
      const api = requireApiClient().api;
      switch (variables.action) {
        case 'accept':
          return api.meAutomationActionAccept({
            params: { id: variables.id },
            body: variables.choice === undefined ? {} : { choice: variables.choice },
          });
        case 'decline':
          return api.meAutomationActionDecline({ params: { id: variables.id } });
        case 'undo':
          return api.meAutomationActionUndo({ params: { id: variables.id } });
      }
    },
    onMutate: async (variables) => {
      const key = queryKeys.automationActions();
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<AutomationActionPageDto>(key);
      client.setQueryData<AutomationActionPageDto>(key, (current) =>
        current === undefined
          ? current
          : {
              ...current,
              items: current.items.map((item) =>
                item.id === variables.id
                  ? { ...item, status: OPTIMISTIC_STATUS[variables.action] }
                  : item,
              ),
            },
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous !== undefined) {
        client.setQueryData(queryKeys.automationActions(), context.previous);
      }
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.automationActions() });
      void client.invalidateQueries({ queryKey: queryKeys.home() });
      void client.invalidateQueries({ queryKey: ['agenda'] });
    },
  });

  return { run: mutation.mutateAsync, pending: mutation.isPending };
}

export interface SlotMoveVariables {
  readonly slotId: string;
  readonly expectedVersion: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface SlotMover {
  readonly move: (variables: SlotMoveVariables) => Promise<SlotMoveOutput>;
  readonly pending: boolean;
}

/** Moves the highlighted slot to a chosen window (`POST /slots/:sid/move`, SPEC-3201 EF-3). */
export function useSlotMove(): SlotMover {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (variables: SlotMoveVariables) =>
      requireApiClient().api.slotMove({
        params: { sid: variables.slotId },
        body: {
          expectedVersion: variables.expectedVersion,
          startsAt: variables.startsAt,
          endsAt: variables.endsAt,
        },
      }),
    onSettled: (_data, _error, variables) => {
      void client.invalidateQueries({ queryKey: queryKeys.slotAlternatives(variables.slotId) });
      void client.invalidateQueries({ queryKey: queryKeys.home() });
      void client.invalidateQueries({ queryKey: ['agenda'] });
    },
  });

  return { move: mutation.mutateAsync, pending: mutation.isPending };
}

/** Refreshes every read of the screen in one gesture (EF-8, pull-to-refresh). */
export function useRefreshToday(): () => void {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: queryKeys.home() });
    void client.invalidateQueries({ queryKey: queryKeys.streak() });
    void client.invalidateQueries({ queryKey: queryKeys.automationActions() });
    void client.invalidateQueries({ queryKey: queryKeys.warmupsToday() });
  };
}
