// Public API of the browser push channel (`@learny/notifications/push`, SPEC-205).
export type { PushSystemContext, PushUserContext } from './context';
export {
  PUSH_PAYLOAD_MAX_BYTES,
  PUSH_TTL_SECONDS,
  buildPushPayload,
  safeNotificationUrl,
  serializePushPayload,
} from './payload';
export type { PushNotificationInput, PushPayload } from './payload';
export {
  GONE_STATUSES,
  MOCK_STATUS,
  MockPushTransport,
  PUSH_REQUEST_TIMEOUT_MS,
  WebPushTransport,
  classifyPushStatus,
  createPushTransport,
  mockOutcomeOf,
  mockPushEndpoint,
} from './transport';
export type {
  MockPushRecord,
  PushSendOptions,
  PushSendResult,
  PushTarget,
  PushTransport,
  PushTransportConfig,
  VapidDetails,
} from './transport';
export {
  listPushSubscriptions,
  removePushSubscription,
  upsertPushSubscription,
} from './subscriptions';
export {
  PUSH_ERROR_CODES,
  PUSH_MAX_FAILURES,
  decideAttempt,
  sendPush,
  summarizeRound,
} from './send';
export type {
  AttemptDecision,
  PushAttempt,
  PushDeps,
  PushSendOutcome,
  RoundSummary,
  SendPushInput,
} from './send';
export { DEMO_PUSH_NOTIFICATION, sendDemoPush } from './demo';
