// Public API of the subscription service (`@learny/services/billing`, SPEC-210).
export {
  DEFAULT_DAILY_CAP_USD,
  PORTAL_RETURN_PATH,
  getSubscription,
  openPortal,
  startCheckout,
} from './checkout';
export type { StartCheckoutOptions } from './checkout';
export { resolveBillingConfig, WEBHOOK_TOLERANCE_SECONDS } from './config';
export type { BillingConfig } from './config';
export { resolveBillingDeps, WebhookJournal } from './deps';
export type { BillingDeps, JournalEntry } from './deps';
export {
  cancelMockCheckout,
  getMockCheckoutSession,
  listStripeEvents,
  payMockCheckout,
  simulateStripeAction,
} from './dev';
export type { SimulatedAction, StripeEventLine } from './dev';
export { hasManagedAi, isManagedAiEntitled } from './entitlement';
export type { EntitlementInput, HasManagedAiOptions } from './entitlement';
export { MockStripeGateway, createMockState, mockCheckoutUrl } from './mock-stripe';
export type { MockCheckoutSession, MockDelivery, MockStripeState } from './mock-stripe';
export { StripeSdkGateway, translateStripeError } from './stripe-client';
export type { StripeGateway, StripeSubscriptionState } from './stripe-client';
export { normalizeStripeEvent, signPayload, verifySignature } from './stripe-event';
export type { StripeEvent } from './stripe-event';
export { isKnownStripeStatus, mapStripeStatus, maskStripeId } from './status';
export { handleWebhook } from './webhook';
export type { WebhookInput, WebhookOutcome } from './webhook';
