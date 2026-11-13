// Dedupe keys of the cost notifications (SPEC-507 EF-2, CA-2). Keys are bounded by SPEC-109 (200
// characters) and scoped by the database unique `(user_id, dedupe_key)`.
export const AI_COST_ALERT_DEDUPE_PREFIX = 'ai_cost_alert';
export const AI_PROGRAMME_DEFERRED_DEDUPE_PREFIX = 'ai_programme_deferred';

/** One 80 % alert per learner and local day. */
export function costAlertKey(localDay: string): string {
  return `${AI_COST_ALERT_DEDUPE_PREFIX}:${localDay}`;
}

/** One programme deferral notice per learner and local day. */
export function programmeDeferredKey(localDay: string): string {
  return `${AI_PROGRAMME_DEFERRED_DEDUPE_PREFIX}:${localDay}`;
}
