// SCR-15 « Modèles d'IA » — abonnement à l'IA fournie et plafond quotidien (SPEC-725).
//
// The module only composes the existing services: the subscription of SPEC-210 decides the
// entitlement (`hasManagedAi`, server-side) and the usage of SPEC-507 carries the local day, the
// cap, the alert and the reset instant. The block never recomputes money from the browser and
// never receives a Stripe key.
import {
  managedAiAvailability,
  managedAiCapState,
  type AiProviderCard,
  type AiUsageOutput,
  type BillingUrlOutput,
  type CheckoutBody,
  type ManagedAiState,
  type SubscriptionOutput,
} from '@learny/contracts';
import { AppError, ok, type Result } from '@learny/core';

import { getAiUsage } from './ai';
import { getSubscription, openPortal, startCheckout } from './billing';
import type { ServiceContext } from './context';

/** EF-2 — a qualified personal key unlocks the AI tasks without a subscription (BR-IA-06). */
export function hasQualifiedPersonalKey(providers: readonly AiProviderCard[]): boolean {
  return providers.some(
    (provider) => provider.origin === 'personal' && provider.status === 'qualified',
  );
}

/** CA-1 — a single boolean for the UI: at least one qualified personal key exists. */
export function buildManagedAiState(input: {
  subscription: SubscriptionOutput;
  usage: AiUsageOutput;
  hasQualifiedPersonalKey: boolean;
}): ManagedAiState {
  return {
    subscription: input.subscription,
    usage: input.usage,
    hasQualifiedPersonalKey: input.hasQualifiedPersonalKey,
    availability: managedAiAvailability({
      hasManagedAi: input.subscription.hasManagedAi,
      hasQualifiedPersonalKey: input.hasQualifiedPersonalKey,
    }),
  };
}

/** EF-3 — exposed for the block and its tests; the server percentage is the source of truth. */
export function managedAiCap(usage: AiUsageOutput): ReturnType<typeof managedAiCapState> {
  return managedAiCapState(usage);
}

/** EF-1, ET-3 — the two server calls run in parallel; one failure fails the block. */
export async function loadManagedAiState(
  ctx: ServiceContext,
  input: { hasQualifiedPersonalKey: boolean },
  deps: {
    subscription?: typeof getSubscription;
    usage?: typeof getAiUsage;
  } = {},
): Promise<Result<ManagedAiState>> {
  try {
    const [subscription, usage] = await Promise.all([
      (deps.subscription ?? getSubscription)(ctx),
      (deps.usage ?? getAiUsage)(ctx, {}),
    ]);
    if (!usage.ok) return usage;
    return ok(
      buildManagedAiState({
        subscription,
        usage: usage.value,
        hasQualifiedPersonalKey: input.hasQualifiedPersonalKey,
      }),
    );
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error };
    throw error;
  }
}

/** EF-1 — Checkout never runs in the browser; the server returns the hosted URL. */
export function subscribeToManagedAi(
  ctx: ServiceContext,
  body: CheckoutBody,
  deps: { checkout?: typeof startCheckout } = {},
): Promise<BillingUrlOutput> {
  return (deps.checkout ?? startCheckout)(ctx, body);
}

/** EF-1 — the Stripe portal is opened by the server for the learner's own customer. */
export function manageManagedAi(
  ctx: ServiceContext,
  deps: { portal?: typeof openPortal } = {},
): Promise<BillingUrlOutput> {
  return (deps.portal ?? openPortal)(ctx);
}
