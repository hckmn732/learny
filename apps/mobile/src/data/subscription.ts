// Abonnement du mobile (SPEC-3401 ET-1, ET-3 ; BR-SET-06 ; ADR-3006 ; canevas § 4).
//
// The mobile application only *reads* the subscription: the stores forbid selling or managing a
// subscription outside their own purchase flow, so `POST /billing/checkout` and
// `POST /billing/portal` are never called here (ET-3, proven by `api/billing-guard.test.ts`).
// The status and the end of the period are shown as the server sends them.
import { useQuery } from '@tanstack/react-query';

import type { SubscriptionOutput } from '@learny/contracts';

import { requireApiClient } from '../api/registry';

import { queryKeys } from './keys';
import type { SettingsStatus } from './profile';

export interface SubscriptionQuery {
  readonly status: SettingsStatus;
  readonly data: SubscriptionOutput | null;
  readonly refetch: () => void;
}

/** Entitlement of the learner (`GET /billing/subscription`, BR-SET-06). */
export function useSubscription(): SubscriptionQuery {
  const query = useQuery({
    queryKey: queryKeys.subscription(),
    queryFn: () => requireApiClient().api.billingSubscription({}),
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
