import { z } from 'zod';

import { AiUsageOutput } from './ai';
import { CheckoutBody, SubscriptionOutput } from './billing';

// SCR-15 « Modèles d'IA » — abonnement à l'IA fournie (SPEC-725, BR-SET-06, BR-IA-06, BR-IA-07).
//
// The block only projects the data of SPEC-210 (`GET /billing/subscription`) and SPEC-507
// (`GET /me/ai/usage`). No Stripe key, price or identifier crosses this boundary; a missing
// official price is an unavailable state, never an invented amount (ET-5).

export const MANAGED_AI_AVAILABILITIES = ['managed', 'personal', 'unavailable'] as const;
export const ManagedAiAvailability = z.enum(MANAGED_AI_AVAILABILITIES);
export type ManagedAiAvailability = z.infer<typeof ManagedAiAvailability>;

/** EF-2 — why the AI tasks of the learner are available or not. */
export const ManagedAiAvailabilityReason = z.enum(['subscription_active', 'personal_key', 'none']);
export type ManagedAiAvailabilityReason = z.infer<typeof ManagedAiAvailabilityReason>;

export const ManagedAiState = z.object({
  subscription: SubscriptionOutput,
  usage: AiUsageOutput,
  availability: ManagedAiAvailability,
  /** True when at least one personal key is qualified for a task (BR-IA-06). */
  hasQualifiedPersonalKey: z.boolean(),
});
export type ManagedAiState = z.infer<typeof ManagedAiState>;

/** EF-1 — the two hosted pages the block may open; both return to the settings tab. */
export const ManagedAiCheckoutBody = CheckoutBody;
export type ManagedAiCheckoutBody = z.infer<typeof ManagedAiCheckoutBody>;

/** EF-2, EF-3 — stable codes surfaced by the block and by the AI task guards. */
export const MANAGED_AI_ERROR_CODES = ['AI_UNAVAILABLE', 'AI_CAP_REACHED'] as const;
export const ManagedAiErrorCode = z.enum(MANAGED_AI_ERROR_CODES);
export type ManagedAiErrorCode = z.infer<typeof ManagedAiErrorCode>;

/** CA-1 — an active subscription or a qualified personal key unlocks a task. */
export function managedAiAvailability(input: {
  hasManagedAi: boolean;
  hasQualifiedPersonalKey: boolean;
}): ManagedAiAvailability {
  if (input.hasManagedAi) return 'managed';
  if (input.hasQualifiedPersonalKey) return 'personal';
  return 'unavailable';
}

/** EF-2 — the reason displayed next to the badge. */
export function managedAiAvailabilityReason(input: {
  hasManagedAi: boolean;
  hasQualifiedPersonalKey: boolean;
}): ManagedAiAvailabilityReason {
  if (input.hasManagedAi) return 'subscription_active';
  if (input.hasQualifiedPersonalKey) return 'personal_key';
  return 'none';
}

/** EF-3 — the three states of the daily cap, from the percentage of SPEC-507. */
export const MANAGED_AI_CAP_STATES = ['normal', 'alert', 'reached'] as const;
export const ManagedAiCapState = z.enum(MANAGED_AI_CAP_STATES);
export type ManagedAiCapState = z.infer<typeof ManagedAiCapState>;

/**
 * EF-3 — 80 % (the configured alert) shows the in-app alert; 100 % reaches the cap. The percentage
 * comes from the server (`/me/ai/usage`); the block never recomputes it from the amounts.
 */
export function managedAiCapState(input: {
  percentUsed: number;
  alert: boolean;
  alertThresholdPercent: number;
}): ManagedAiCapState {
  if (input.percentUsed >= 100) return 'reached';
  if (input.alert || input.percentUsed >= input.alertThresholdPercent) return 'alert';
  return 'normal';
}

/** CA-2 — the local day and instant when the cap resets (server-computed, ISO UTC). */
export function managedAiResetsAt(usage: Pick<AiUsageOutput, 'resetsAt'>): string {
  return usage.resetsAt;
}
