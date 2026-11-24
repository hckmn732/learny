// Data of the Programme tab (SPEC-3202 ET-1, ET-3, BR-FOR-11, BR-COU-08; canevas Â§ 4).
//
// Four authenticated reads, one key per route: the learner's profile (`/me`), the formation
// switcher (`/me/sidebar`), the programme of the current formation
// (`['formation', fid, 'programme']`) and the reading progress of the open module
// (`/modules/:mid/course`). The whole cache is persisted by SPEC-3003, so the programme and its
// chapters are readable offline (CL-4). No write route of the programme is ever called
// (ADR-3002): the only mutation is the current-formation preference, which the shell owns too.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  FormationManagementState,
  MeDto,
  MeDto as Me,
  SidebarDto,
  SidebarFormation,
} from '@learny/contracts';

import { requireApiClient } from '../api/registry';

import { queryKeys } from './keys';

export type QueryStatus = 'loading' | 'error' | 'ready';

function statusOf(query: { readonly isError: boolean; readonly data: unknown }): QueryStatus {
  if (query.isError) return 'error';
  return query.data === undefined ? 'loading' : 'ready';
}

/** Profile of the learner: the time zone and the current formation (ET-1, BR-ACC-07). */
export function useMe(): { status: QueryStatus; data: Me | null; retry: () => void } {
  const query = useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => requireApiClient().api.meGet({}),
  });
  return {
    status: statusOf(query),
    data: query.data ?? null,
    retry: () => {
      void query.refetch();
    },
  };
}

/** Active and paused formations, ordered current first (BR-FOR-11, SPEC-304). */
export function useFormationOptions(): {
  status: QueryStatus;
  formations: readonly SidebarFormation[];
  current: SidebarFormation | null;
  retry: () => void;
  refresh: () => Promise<void>;
} {
  const query = useQuery({
    queryKey: queryKeys.sidebar(),
    queryFn: () => requireApiClient().api.sidebarGet({}),
  });
  const data: SidebarDto | undefined = query.data;
  return {
    status: statusOf(query),
    formations: data?.formations ?? [],
    current: data?.currentFormation ?? null,
    retry: () => {
      void query.refetch();
    },
    refresh: async () => {
      await query.refetch();
    },
  };
}

/** Current formation of the learner, as the server records it (ET-1). */
export function useCurrentFormationId(options: {
  readonly me: MeDto | null;
  readonly sidebar: SidebarDto | null;
}): string | null {
  const explicit = options.me?.currentFormationId ?? null;
  if (explicit !== null) return explicit;
  const fromSidebar = options.sidebar?.currentFormation?.id ?? null;
  if (fromSidebar !== null) return fromSidebar;
  return options.sidebar?.formations.find((formation) => formation.status === 'active')?.id ?? null;
}

export interface ProgrammeQuery {
  readonly status: QueryStatus;
  readonly data: import('@learny/contracts').ProgrammeScreenStateDto | null;
  readonly retry: () => void;
  readonly refresh: () => Promise<void>;
}

/**
 * Programme of one formation (ET-1): the active programme or the proposal still to validate
 * (CL-1). The key is the one of the canevas, so the switch of formation changes it and the
 * persisted cache keeps every formation already read.
 */
export function useProgramme(formationId: string | null): ProgrammeQuery {
  const query = useQuery({
    queryKey: queryKeys.programme(formationId ?? 'none'),
    queryFn: () => requireApiClient().api.programmeGet({ params: { fid: formationId ?? '' } }),
    enabled: formationId !== null,
  });
  return {
    // A learner without any formation has no programme to load: the screen shows its empty state.
    status: formationId === null ? 'ready' : statusOf(query),
    data: query.data ?? null,
    retry: () => {
      void query.refetch();
    },
    refresh: async () => {
      await query.refetch();
    },
  };
}

export interface FormationOption {
  readonly id: string;
  readonly title: string;
  readonly status: SidebarFormation['status'];
  readonly monogram: string;
  readonly progressPercent: number;
}

/**
 * Minimal list of the learner's formations (SPEC-604): it makes the difference between « no
 * formation », « programme to validate » (CL-1) and « formation archived ».
 */
export function useFormationsList(): {
  readonly status: QueryStatus;
  readonly items: readonly import('@learny/contracts').FormationSummary[];
  readonly retry: () => void;
} {
  const query = useQuery({
    queryKey: queryKeys.formations(),
    queryFn: () => requireApiClient().api.formationsList({}),
  });
  return {
    status: statusOf(query),
    items: query.data?.items ?? [],
    retry: () => {
      void query.refetch();
    },
  };
}

/** Reading progress and generation state of one module (BR-COU-08, ET-1 `useModule`). */
export function useModuleCourse(moduleId: string | null): {
  readonly status: QueryStatus;
  readonly data: import('@learny/contracts').ModuleCourseScreen | null;
  readonly retry: () => void;
  readonly refresh: () => Promise<void>;
} {
  const query = useQuery({
    queryKey: queryKeys.moduleCourse(moduleId ?? 'none'),
    queryFn: () => requireApiClient().api.moduleCourse({ params: { mid: moduleId ?? '' } }),
    enabled: moduleId !== null,
  });
  return {
    status: moduleId === null ? 'loading' : statusOf(query),
    data: query.data ?? null,
    retry: () => {
      void query.refetch();
    },
    refresh: async () => {
      await query.refetch();
    },
  };
}

export interface SwitchFormationMutation {
  readonly switchTo: (formationId: string) => Promise<FormationManagementState>;
  readonly pending: boolean;
  readonly error: Error | null;
}

/**
 * Changes the current formation (BR-FOR-11, CA-3): one `PATCH /me/current-formation`, then the
 * profile, the switcher and every programme are refreshed from the server answer. The cache is
 * updated from the response, never guessed (no business logic on the client, ADR-3002).
 */
export function useSwitchFormation(): SwitchFormationMutation {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (formationId: string) =>
      requireApiClient().api.currentFormationUpdate({ body: { formationId } }),
    onSuccess: (state) => {
      queryClient.setQueryData<MeDto | undefined>(queryKeys.me(), (previous) =>
        previous === undefined
          ? previous
          : { ...previous, currentFormationId: state.currentFormationId },
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.sidebar() });
      void queryClient.invalidateQueries({ queryKey: ['formation'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.home() });
    },
  });
  return {
    switchTo: mutation.mutateAsync,
    pending: mutation.isPending,
    error: mutation.error ?? null,
  };
}

/** Initials of a formation used as its sigil when the sidebar has not answered yet. */
export function formationSigil(title: string): string {
  const letters = title
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part !== '')
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return (letters === '' ? '?' : letters).slice(0, 3);
}
