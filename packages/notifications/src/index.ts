// @learny/notifications — channels of the notification service (SPEC-204 e-mail, SPEC-205 push,
// SPEC-209 routing). Each channel also has its own entry point (`@learny/notifications/push`,
// `@learny/notifications/email`, `@learny/notifications/notify`).
export * from './push/index';
export {
  NOTIFICATION_TEMPLATES,
  TYPE_PREFERENCE,
  channelsOf,
  clampBody,
  clampTitle,
} from './templates/index';
export type { NotificationData, NotificationTemplate } from './templates/index';
export { decideDelivery, typeSwitchOf } from './routing';
export type { DecideDeliveryInput, DeliveryDecision, DeliverySettings } from './routing';
export { countSentNotifications, deliverDelivery, listDueDeliveries } from './deliveries';
export type { DeliveryContext, DeliveryDeps, DeliveryOutcome } from './deliveries';
export { notify } from './notify';
export type { NotifyResultValue, NotifySystemContext } from './notify';
export {
  DIGEST_ACTIVITY_LIMIT,
  DIGEST_HELD_LIMIT,
  buildDigestData,
  heldBlock,
  sendDailyDigest,
} from './digest';
export type { DigestData, DigestOutcome } from './digest';
