import { z } from 'zod';

import { CivilDate, IsoDateTime, Uuid } from './common';

// Typed catalogue of the domain events (SPEC-203 ET-1, docs/architecture/overview.md §5).
// Every specification that emits or consumes an event reuses the schema below; a new event is
// added here and to the overview table in the same commit.

// Closed vocabularies shared with the database enumerations. `packages/services` holds a test that
// compares each list with the Postgres enumeration it mirrors (contracts never import the database).
export const EVENT_AUTOMATION_KEYS = [
  'reprise',
  'micro_seance',
  'echauffement',
  'remediation',
  'jeu_lacune',
  'questions_cartes',
  'plafond_quiz',
  'sprint',
  'bilan',
  'pause',
] as const;
export const EVENT_NOTIFICATION_TYPES = [
  'validation_soon',
  'course_ready',
  'global_quiz_today',
  'new_gap',
  'session_planned',
  'module_validated',
  'session_to_reschedule',
  'weekly_review',
  'milestone',
  'ai_cost_alert',
  'ai_task_failed',
  'export_ready',
  'group_invitation',
  'daily_digest',
  'relaunch',
  'planning_adjusted',
] as const;
export const EVENT_RESOURCE_KINDS = [
  'note',
  'pdf',
  'web',
  'youtube',
  'image',
  'audio',
  'video',
  'exam_guide',
] as const;
export const EVENT_REVIEW_SOURCES = [
  'validation',
  'global_quiz',
  'warmup',
  'exercise',
  'exam',
  'self_test',
  'micro_session',
  'sprint',
  'offline',
] as const;
export const EVENT_SUBSCRIPTION_STATUSES = [
  'none',
  'active',
  'past_due',
  'canceled',
  'incomplete',
] as const;
export const EVENT_GAP_NATURES = [
  'forgetting',
  'confusion',
  'misunderstanding',
  'application',
] as const;
export const SIGN_UP_METHODS = ['magic_link', 'password'] as const;

const AutomationKey = z.enum(EVENT_AUTOMATION_KEYS);
const NotificationType = z.enum(EVENT_NOTIFICATION_TYPES);
const Score = z.number().min(0).max(100);

const automationAction = z.object({
  userId: Uuid,
  actionId: Uuid,
  automation: AutomationKey,
});
const groupMember = z.object({ groupId: Uuid, formationId: Uuid, userId: Uuid });
const formationRef = z.object({ userId: Uuid, formationId: Uuid });

/** `name → Zod schema of data`. The only source of truth of the event vocabulary. */
export const EVENTS = {
  'user/signed-up': z.object({
    userId: Uuid,
    method: z.enum(SIGN_UP_METHODS),
    signedUpAt: IsoDateTime,
  }),
  'user/onboarding-completed': z.object({ userId: Uuid, completedAt: IsoDateTime }),
  'formation/cadrage-completed': formationRef,
  'formation/programme-requested': z.object({
    userId: Uuid,
    formationId: Uuid,
    changeRequestId: Uuid.nullable(),
  }),
  'formation/programme-imported': z.object({
    userId: Uuid,
    formationId: Uuid,
    importId: Uuid,
  }),
  'formation/programme-validated': z.object({
    userId: Uuid,
    formationId: Uuid,
    validatedAt: IsoDateTime,
  }),
  'formation/paused': z.object({ userId: Uuid, formationId: Uuid, pausedAt: IsoDateTime }),
  'formation/resumed': z.object({ userId: Uuid, formationId: Uuid, resumedOn: CivilDate }),
  'formation/completed': z.object({
    userId: Uuid,
    formationId: Uuid,
    completedAt: IsoDateTime,
  }),
  'resource/uploaded': z.object({
    userId: Uuid,
    resourceId: Uuid,
    formationId: Uuid,
    chapterId: Uuid.nullable(),
    kind: z.enum(EVENT_RESOURCE_KINDS),
  }),
  'resource/ready': z.object({
    userId: Uuid,
    resourceId: Uuid,
    chunkCount: z.number().int().min(0),
  }),
  'resource/failed': z.object({ userId: Uuid, resourceId: Uuid, errorCode: z.string().min(1) }),
  'chapter/contributions-completed': z.object({
    userId: Uuid,
    moduleId: Uuid,
    chapterId: Uuid.nullable(),
    force: z.boolean(),
  }),
  'course/generated': z.object({
    userId: Uuid,
    courseId: Uuid,
    moduleId: Uuid,
    version: z.number().int().min(1),
  }),
  // SPEC-609 — reading progress, chapter summary and versioned section corrections. Each event is
  // emitted once per committed transition; its data stays limited to identifiers and counters.
  'course/progress-updated': z.object({
    userId: Uuid,
    courseId: Uuid,
    chapterId: Uuid,
    percent: z.number().int().min(0).max(100),
  }),
  'course/summary-submitted': z.object({
    userId: Uuid,
    courseId: Uuid,
    chapterId: Uuid,
    summaryId: Uuid,
    corrected: z.boolean(),
  }),
  'course/section-edited': z.object({
    userId: Uuid,
    courseId: Uuid,
    sectionId: Uuid,
    version: z.number().int().min(1),
  }),
  'course/section-reported': z.object({
    userId: Uuid,
    courseId: Uuid,
    sectionId: Uuid,
    reportId: Uuid,
  }),
  'quiz/submitted': z.object({
    userId: Uuid,
    formationId: Uuid,
    attemptId: Uuid,
    activityId: Uuid,
    moduleId: Uuid,
    openCount: z.number().int().min(0),
  }),
  'quiz/graded': z.object({
    userId: Uuid,
    formationId: Uuid,
    attemptId: Uuid,
    moduleId: Uuid,
    score: Score,
    passed: z.boolean(),
    threshold: z.number().int().min(60).max(95),
    attemptNo: z.number().int().min(1),
  }),
  'module/validated': z.object({
    userId: Uuid,
    formationId: Uuid,
    moduleId: Uuid,
    score: Score,
  }),
  'gap/detected': z.object({
    userId: Uuid,
    formationId: Uuid,
    notionId: Uuid,
    nature: z.enum(EVENT_GAP_NATURES),
  }),
  // SPEC-411 EF-2 — a stricter nature replaces the active one (BR-LAC-03); `previousNature`
  // keeps two successive changes of the same new nature distinct in the outbox.
  'gap/nature-changed': z.object({
    userId: Uuid,
    formationId: Uuid,
    notionId: Uuid,
    nature: z.enum(EVENT_GAP_NATURES),
    previousNature: z.enum(EVENT_GAP_NATURES),
  }),
  'gap/cleared': z.object({ userId: Uuid, formationId: Uuid, notionId: Uuid }),
  'review/answered': z.object({
    userId: Uuid,
    notionId: Uuid,
    source: z.enum(EVENT_REVIEW_SOURCES),
    correct: z.boolean(),
    reviewedAt: IsoDateTime,
  }),
  'exam/submitted': z.object({ userId: Uuid, formationId: Uuid, attemptId: Uuid }),
  'exercise/submitted': z.object({ userId: Uuid, moduleId: Uuid, attemptId: Uuid }),
  'tutor/question-asked': z.object({
    userId: Uuid,
    courseId: Uuid,
    conversationId: Uuid,
    messageId: Uuid,
  }),
  'automation/action-proposed': automationAction,
  'automation/action-applied': automationAction,
  'automation/action-undone': automationAction,
  'notification/requested': z.object({
    userId: Uuid,
    type: NotificationType,
    data: z.record(z.string(), z.unknown()),
    formationId: Uuid.nullable(),
    dedupeKey: z.string().min(1).max(200).nullable(),
    externalChannels: z.boolean().default(true),
  }),
  // SPEC-209 ET-4 — one committed delivery to send; the identifier makes a replay a no-op.
  'notification/delivery-due': z.object({
    userId: Uuid,
    notificationId: Uuid,
    deliveryId: Uuid,
    channel: z.enum(['email', 'push']),
    /** EF-6 — the payload of the notification, replayed by a deferred e-mail (digest). */
    data: z.record(z.string(), z.unknown()).optional(),
  }),
  'billing/subscription-changed': z.object({
    userId: Uuid,
    status: z.enum(EVENT_SUBSCRIPTION_STATUSES),
    previousStatus: z.enum(EVENT_SUBSCRIPTION_STATUSES),
  }),
  // SPEC-210 ET-5 — a payment failed (`invoice.payment_failed`): SPEC-725 notifies the learner.
  'billing/payment-failed': z.object({ userId: Uuid }),
  'account/export-requested': z.object({ userId: Uuid, exportId: Uuid }),
  'account/deletion-requested': z.object({ userId: Uuid, scheduledFor: IsoDateTime }),
  'group/member-joined': groupMember,
  'group/member-left': groupMember,
  'cron/hourly-tick': z.object({ tickAt: IsoDateTime }),
  'cron/nightly': z.object({ runDate: CivilDate }),
  'user/local-tick': z.object({
    userId: Uuid,
    timezone: z.string().min(1),
    windowStart: IsoDateTime,
    windowEnd: IsoDateTime,
    localDate: CivilDate,
    localWeekday: z.number().int().min(1).max(7),
  }),
  'sdd/demo-requested': z.object({
    runId: Uuid,
    failOnceAt: z.enum(['none', 'step-2']),
  }),
} as const;

export type EventName = keyof typeof EVENTS;
export const EVENT_NAMES_LIST = Object.keys(EVENTS) as EventName[];

/** Payload accepted by the emitter (input side: defaults such as `externalChannels` are optional). */
export type EventInput<N extends EventName> = z.input<(typeof EVENTS)[N]>;
/** Payload received by a consumer (output side: defaults applied). */
export type EventData<N extends EventName> = z.output<(typeof EVENTS)[N]>;

export function isEventName(value: string): value is EventName {
  return Object.prototype.hasOwnProperty.call(EVENTS, value);
}

/** Parses and normalises the data of an event; throws a `ZodError` when the schema is violated. */
export function parseEventData<N extends EventName>(name: N, data: unknown): EventData<N> {
  return EVENTS[name].parse(data) as EventData<N>;
}
