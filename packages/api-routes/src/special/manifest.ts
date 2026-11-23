// SPEC-1004 EF-2 / SPEC-1201 - method and path of every special Hono handler. The coverage test
// compares this data with SPECIAL_HANDLERS so the two can never drift.
export const SPECIAL_ROUTE_MANIFEST = [
  { key: 'health', method: 'GET', path: '/api/v1/health' },
  { key: 'authCallback', method: 'GET', path: '/api/v1/auth/callback' },
  { key: 'devEmailOutbox', method: 'GET', path: '/api/v1/dev/sdd/email/outbox' },
  { key: 'devEmailOutboxPurge', method: 'DELETE', path: '/api/v1/dev/sdd/email/outbox' },
  { key: 'devEventsDemoRun', method: 'GET', path: '/api/v1/dev/sdd/events/demo/:runId' },
  { key: 'devEventsDemoStart', method: 'POST', path: '/api/v1/dev/sdd/events/demo' },
  {
    key: 'devNotificationsGenerate',
    method: 'POST',
    path: '/api/v1/dev/sdd/notifications/generate',
  },
  {
    key: 'devStripeCheckoutCancel',
    method: 'POST',
    path: '/api/v1/dev/sdd/stripe/checkout/cancel',
  },
  { key: 'devStripeCheckoutPay', method: 'POST', path: '/api/v1/dev/sdd/stripe/checkout/pay' },
  { key: 'devStripeSimulate', method: 'POST', path: '/api/v1/dev/sdd/stripe/simulate' },
  { key: 'formationSprints', method: 'POST', path: '/api/v1/formations/:fid/sprints' },
] as const;
