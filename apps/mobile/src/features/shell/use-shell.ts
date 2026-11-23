// Data of the shell (SPEC-3102 EF-1, ET-2, BR-NAV-01, BR-ACC-04; canevas § 4).
//
// Three authenticated reads, one query key each, and the polling rule of the unread pastille:
// every 60 s while the screen that shows the bell is visible, never in the background (ET-2).
// The server decides the counts; the shell only displays them.
import { useQuery } from '@tanstack/react-query';

import type { HeaderDto, OnboardingStep } from '@learny/contracts';

import { requireApiClient } from '../../api/registry';
import { queryKeys } from '../../data/keys';

/** Interval of the unread pastille while the bell is on screen (ET-2). */
export const UNREAD_POLL_MS = 60_000;

export type ShellQueryStatus = 'loading' | 'error' | 'ready';

function statusOf(query: { readonly isError: boolean; readonly data: unknown }): ShellQueryStatus {
  if (query.isError) return 'error';
  return query.data === undefined ? 'loading' : 'ready';
}

export interface HeaderQuery {
  readonly status: ShellQueryStatus;
  readonly data: HeaderDto | null;
  readonly retry: () => void;
}

/** Identity, active formations and unread count of the header (BR-NAV-01). */
export function useHeader(): HeaderQuery {
  const query = useQuery({
    queryKey: queryKeys.header(),
    queryFn: () => requireApiClient().api.headerGet({}),
    // A cold start can race the publication of the session token: the header retries instead of
    // leaving the bell and the pastille empty for the whole session (CA-2).
    retry: 3,
    retryDelay: 1_000,
    refetchOnMount: 'always',
  });
  return {
    status: statusOf(query),
    data: query.data ?? null,
    retry: () => {
      void query.refetch();
    },
  };
}

export interface UnreadCountQuery {
  readonly count: number;
  readonly status: ShellQueryStatus;
  readonly retry: () => void;
}

/**
 * Unread count of the bell (ET-2, BR-NOT-01): refreshed every `UNREAD_POLL_MS` while `active`,
 * on the return to the foreground (the wiring of SPEC-3003 invalidates the active queries) and
 * after every read mutation (the actions invalidate this key).
 */
export function useUnreadCount(
  options: { readonly active?: boolean; readonly initialCount?: number } = {},
): UnreadCountQuery {
  const active = options.active ?? true;
  const query = useQuery({
    queryKey: queryKeys.unreadCount(),
    queryFn: () => requireApiClient().api.notificationsUnreadCount({}),
    // While the count is unknown (first start, failed request) the pastille is retried every
    // three seconds; once known, the rule of ET-2 applies (60 s, only when visible).
    refetchInterval: (query) =>
      query.state.data === undefined ? 3_000 : active ? UNREAD_POLL_MS : false,
    refetchIntervalInBackground: false,
    retry: 2,
  });
  const count = Math.max(0, query.data?.count ?? options.initialCount ?? 0);
  return {
    count,
    status: statusOf(query),
    retry: () => {
      void query.refetch();
    },
  };
}

export interface OnboardingQuery {
  readonly status: ShellQueryStatus;
  readonly step: OnboardingStep | null;
  /** True when the configuration is finished (ADR-3002 § 3). */
  readonly completed: boolean;
  readonly retry: () => void;
  /** Re-reads the server and answers whether the configuration is finished now (CL-4). */
  readonly refresh: () => Promise<boolean>;
}

/** State of the onboarding of the learner (BR-ACC-04, CL-4). */
export function useOnboarding(): OnboardingQuery {
  const query = useQuery({
    queryKey: queryKeys.onboarding(),
    queryFn: () => requireApiClient().api.meOnboardingGet({}),
    // CL-4 — the learner may finish the configuration on the web while the gate is open.
    staleTime: 0,
    retry: 1,
  });
  const step = query.data?.profile.onboardingStep ?? null;
  return {
    status: statusOf(query),
    step,
    completed: step === 'done',
    retry: () => {
      void query.refetch();
    },
    refresh: async () => {
      const result = await query.refetch();
      return result.data?.profile.onboardingStep === 'done';
    },
  };
}

export interface FormationsQuery {
  readonly status: ShellQueryStatus;
  readonly count: number;
  readonly retry: () => void;
}

/** Active formations of the learner: the empty answer gives the « Aucune formation » screen (EF-7). */
export function useFormations(): FormationsQuery {
  const query = useQuery({
    queryKey: queryKeys.formations(),
    queryFn: () => requireApiClient().api.formationsList({}),
    retry: 1,
  });
  const items = query.data?.items ?? [];
  return {
    status: statusOf(query),
    count: items.filter((formation) => formation.status !== 'archived').length,
    retry: () => {
      void query.refetch();
    },
  };
}

/** Initials of the account on the indigo disc: first name and last name, else the address (BR-NAV-01). */
export function initialsOf(source: {
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly emailLabel: string | null;
}): string {
  const fromNames = [source.firstName, source.lastName]
    .map((value) => value?.trim().charAt(0) ?? '')
    .join('');
  if (fromNames.length > 0) return fromNames.toUpperCase();
  const address = source.emailLabel ?? '';
  const local = address.split('@')[0] ?? '';
  const parts = local.split(/[._-]/).filter((part) => part !== '');
  const initials = parts
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('');
  return (initials === '' ? '?' : initials).toUpperCase();
}

/** Display name of the account: first and last name, else the abbreviated address. */
export function displayNameOf(source: {
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly emailLabel: string | null;
}): string {
  const name = [source.firstName, source.lastName]
    .map((value) => value?.trim() ?? '')
    .filter((value) => value !== '')
    .join(' ');
  if (name !== '') return name;
  return source.emailLabel ?? '';
}
