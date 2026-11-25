// Lectures et mutations des trois écrans de la zone Programme (canevas § 4).
//
// One read per screen, keyed by the formation or the module, and one mutation per intent; the
// screen never computes a state the server owns (ADR-3002). The apports are polled every three
// seconds while one of them is queued or being processed, exactly like the web (ADR-0065).
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { FinalReviewDto, GroupState, ModuleScreen } from '@learny/contracts';

import { requireApiClient } from '../../../api/registry';

/** Small enough to be readable by every screen of the zone. */
export type LoadStatus = 'loading' | 'error' | 'ready';

export interface Readable<T> {
  readonly status: LoadStatus;
  readonly data: T | null;
  readonly retry: () => void;
  readonly refresh: () => Promise<void>;
}

const PENDING: readonly string[] = ['queued', 'processing'];

/** Keys of the zone, under the `mr` prefix so that no other screen shares them. */
export const mrKeys = {
  apportsPrefix: (moduleId: string) => ['mr', 'apports', moduleId] as const,
  apports: (moduleId: string, chapterId: string | null) =>
    ['mr', 'apports', moduleId, chapterId ?? 'none'] as const,
  bilan: (formationId: string) => ['mr', 'bilan', formationId] as const,
  groupe: (formationId: string) => ['mr', 'groupe', formationId] as const,
} as const;

function statusOf(query: { readonly isError: boolean; readonly data: unknown }): LoadStatus {
  if (query.isError) return 'error';
  return query.data === undefined ? 'loading' : 'ready';
}

/** Module and apports of one chapter (`GET /modules/:mid`), polled while processing runs. */
export function useModuleScreen(
  moduleId: string,
  chapterId: string | null,
): Readable<ModuleScreen> {
  const query: UseQueryResult<ModuleScreen> = useQuery({
    queryKey: mrKeys.apports(moduleId, chapterId),
    queryFn: () =>
      requireApiClient().api.moduleScreen({
        params: { mid: moduleId },
        ...(chapterId === null ? {} : { query: { chapitre: chapterId } }),
      }),
    enabled: moduleId !== '',
    refetchInterval: (current) => {
      const data = current.state.data;
      const running = data?.resources.some((resource) => PENDING.includes(resource.status));
      return running === true ? 3000 : false;
    },
  });
  return {
    status: moduleId === '' ? 'error' : statusOf(query),
    data: query.data ?? null,
    retry: () => {
      void query.refetch();
    },
    refresh: async () => {
      await query.refetch();
    },
  };
}

/** Final review of a completed formation (`GET /formations/:fid/final-review`). */
export function useFinalReview(formationId: string): Readable<FinalReviewDto> {
  const query: UseQueryResult<FinalReviewDto> = useQuery({
    queryKey: mrKeys.bilan(formationId),
    queryFn: () => requireApiClient().api.getFinalReview({ params: { fid: formationId } }),
    enabled: formationId !== '',
  });
  return {
    status: formationId === '' ? 'error' : statusOf(query),
    data: query.data ?? null,
    retry: () => {
      void query.refetch();
    },
    refresh: async () => {
      await query.refetch();
    },
  };
}

/** State of the group of a formation (`GET /formations/:fid/group`). */
export function useFormationGroup(formationId: string): Readable<GroupState> {
  const query: UseQueryResult<GroupState> = useQuery({
    queryKey: mrKeys.groupe(formationId),
    queryFn: () => requireApiClient().api.formationGroupGet({ params: { fid: formationId } }),
    enabled: formationId !== '',
  });
  return {
    status: formationId === '' ? 'error' : statusOf(query),
    data: query.data ?? null,
    retry: () => {
      void query.refetch();
    },
    refresh: async () => {
      await query.refetch();
    },
  };
}