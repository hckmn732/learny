import { z } from 'zod';

import { CivilDate, IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';
import { NotificationType } from './notifications';

// Contracts of the notification producers (SPEC-706, BR-NOT-02, BR-NOT-07).
//
// One producer builds the facts of a domain event and the shared producer module
// (`@learny/notifications/producers`) turns them into a `notify` input: title, body, icon and href
// come from the SPEC-209 templates, the dedupe key and the eligibility instant from the rules
// below. A producer never writes a notification itself and never bypasses the preferences, quiet
// hours or daily cap of SPEC-209 (ET-3).

/** The thirteen types of BR-NOT-02; the digest and the automations of SPEC-718/720 stay out. */
export const NOTIFICATION_PRODUCER_TYPES = [
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
] as const;

export const NotificationProducerType = z.enum(NOTIFICATION_PRODUCER_TYPES);
export type NotificationProducerType = z.infer<typeof NotificationProducerType>;

/** One producer per type and per source event of `docs/architecture/overview.md` §5. */
export const NOTIFICATION_PRODUCER_KINDS = [
  'validation_quiz_reminder',
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
] as const;

export const NotificationProducerKind = z.enum(NOTIFICATION_PRODUCER_KINDS);
export type NotificationProducerKind = z.infer<typeof NotificationProducerKind>;

const producerBase = {
  /** The learner who receives the notification; ownership is checked before any write (ET-1). */
  userId: Uuid,
  formationId: Uuid.nullable().optional(),
} as const;

/**
 * EF-1 — facts of the 13 producers. Every fact carries identifiers and already validated labels;
 * a rendered text, an href or an AI sentence never comes from here (ET-4).
 */
export const NotificationProducerFacts = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('validation_quiz_reminder'),
    ...producerBase,
    /** Planned validation quiz; the dedupe key includes it and its exact start (EF-2, ET-4). */
    slotId: Uuid,
    moduleId: Uuid.nullable().optional(),
    moduleTitle: z.string().trim().min(1).max(120).optional(),
    startsAt: IsoDateTime,
    /** IANA zone of the profile, used for the local « aujourd’hui à 15:00 » label (ET-2). */
    timezone: z.string().trim().min(1).max(64),
    minutes: z.number().int().min(1).max(240).optional(),
  }),
  z.object({
    kind: z.literal('course_ready'),
    ...producerBase,
    courseId: Uuid,
    moduleId: Uuid.nullable().optional(),
    moduleTitle: z.string().trim().min(1).max(120).optional(),
    version: z.number().int().min(1).optional(),
  }),
  z.object({
    kind: z.literal('global_quiz_today'),
    ...producerBase,
    /** Local civil day of the learner: one session per day, never one per UTC day (ET-2). */
    localDay: CivilDate,
    notions: z.number().int().min(0).max(10_000),
    minutes: z.number().int().min(1).max(240),
  }),
  z.object({
    kind: z.literal('new_gap'),
    ...producerBase,
    gapId: Uuid,
    notionTitle: z.string().trim().min(1).max(120),
    formationTitle: z.string().trim().min(1).max(120).optional(),
  }),
  z.object({
    kind: z.literal('session_planned'),
    ...producerBase,
    slotId: Uuid,
    title: z.string().trim().min(1).max(200),
    startsAt: IsoDateTime,
    timezone: z.string().trim().min(1).max(64),
  }),
  z.object({
    kind: z.literal('module_validated'),
    ...producerBase,
    moduleId: Uuid,
    modulePosition: z.number().int().min(0).max(10_000),
    moduleTitle: z.string().trim().min(1).max(120),
    score: z.number().min(0).max(100),
    nextModulePosition: z.number().int().min(0).max(10_000).optional(),
    nextModuleTitle: z.string().trim().min(1).max(120).optional(),
    isLastModule: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('session_to_reschedule'),
    ...producerBase,
    slotId: Uuid,
    title: z.string().trim().min(1).max(200),
  }),
  z.object({
    kind: z.literal('weekly_review'),
    ...producerBase,
    /** Monday of the local week; one review per week (ET-4). */
    weekStart: CivilDate,
    studyLabel: z.string().trim().min(1).max(120).optional(),
  }),
  z.object({
    kind: z.literal('milestone'),
    ...producerBase,
    milestoneId: Uuid,
    label: z.string().trim().min(1).max(120),
  }),
  z.object({
    kind: z.literal('ai_cost_alert'),
    ...producerBase,
    localDay: CivilDate,
    percent: z.number().min(0).max(100),
  }),
  z.object({
    kind: z.literal('ai_task_failed'),
    ...producerBase,
    taskId: Uuid,
    taskLabel: z.string().trim().min(1).max(120),
    modelLabel: z.string().trim().min(1).max(200).optional(),
  }),
  z.object({
    kind: z.literal('export_ready'),
    ...producerBase,
    exportId: Uuid,
    days: z.number().int().min(1).max(30).optional(),
  }),
  z.object({
    kind: z.literal('group_invitation'),
    ...producerBase,
    groupId: Uuid,
    invitedUserId: Uuid,
    groupTitle: z.string().trim().min(1).max(120),
  }),
]);
export type NotificationProducerFacts = z.infer<typeof NotificationProducerFacts>;

/**
 * ET-4 — a stable dedupe key: the learner and the object/deadline never produce two rows. The
 * maximum of 200 characters is the SPEC-209 bound; a produced key that overflows is refused
 * before any write (CL-1).
 */
export const ProducerDedupeKey = z.string().trim().min(1).max(200);

/**
 * EF-2, BR-NOT-07 — the exact reminder request. `startsAt` is the planned instant of the quiz; the
 * eligibility instant is 40 minutes earlier and the producer transmits it to `notify` (SPEC-209).
 */
export const ValidationQuizReminderRequest = z.object({
  userId: Uuid,
  formationId: Uuid.nullable().optional(),
  slotId: Uuid,
  moduleId: Uuid.nullable().optional(),
  moduleTitle: z.string().trim().min(1).max(120).optional(),
  startsAt: IsoDateTime,
  /** IANA zone of the profile; invalid values are refused by `@learny/core/time` (CL-1). */
  timezone: z.string().trim().min(1).max(64),
  minutes: z.number().int().min(1).max(240).optional(),
});
export type ValidationQuizReminderRequest = z.infer<typeof ValidationQuizReminderRequest>;

/** EF-2, CA-2 — the computed eligibility of one reminder, in UTC and in the profile zone. */
export const ValidationQuizReminderSchedule = z.object({
  slotId: Uuid,
  startAt: IsoDateTime,
  eligibleAt: IsoDateTime,
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  localDay: CivilDate,
  dedupeKey: ProducerDedupeKey,
});
export type ValidationQuizReminderSchedule = z.infer<typeof ValidationQuizReminderSchedule>;

export const ProducedNotification = z.object({
  type: NotificationProducerType,
  kind: NotificationProducerKind,
  dedupeKey: ProducerDedupeKey,
  notificationId: Uuid,
  created: z.boolean(),
  /** Deep link computed from the routes of `docs/product/screens.md` (ET-4). */
  href: z.string().min(1).max(2048).startsWith('/'),
  title: z.string().min(1).max(120),
  icon: z.string().min(1).max(40),
});
export type ProducedNotification = z.infer<typeof ProducedNotification>;

/** Routing of a producer kind to the notification type of BR-NOT-02. */
export const PRODUCER_KIND_TO_TYPE: Record<NotificationProducerKind, NotificationProducerType> = {
  validation_quiz_reminder: 'validation_soon',
  course_ready: 'course_ready',
  global_quiz_today: 'global_quiz_today',
  new_gap: 'new_gap',
  session_planned: 'session_planned',
  module_validated: 'module_validated',
  session_to_reschedule: 'session_to_reschedule',
  weekly_review: 'weekly_review',
  milestone: 'milestone',
  ai_cost_alert: 'ai_cost_alert',
  ai_task_failed: 'ai_task_failed',
  export_ready: 'export_ready',
  group_invitation: 'group_invitation',
};

/** EF-1 — the notification type of a producer kind, validated against the SPEC-209 enum. */
export function notificationTypeOf(kind: NotificationProducerKind): NotificationProducerType {
  const type = PRODUCER_KIND_TO_TYPE[kind];
  return NotificationProducerType.parse(type);
}

/**
 * EF-8 — demonstration route: generate the thirteen types and, optionally, the reminder of a
 * validation quiz for the signed-in learner. The route is idempotent: the dedupe keys make a
 * replay create nothing (CA-1, CA-3).
 */
export const DevNotificationsGenerationInput = z.object({
  /** All producer types are generated unless a subset is requested. */
  types: z.array(NotificationProducerType).min(1).optional(),
  /**
   * Planned start of the demonstration validation quiz; a second call with the same `slotId` and a
   * later `startsAt` simulates the move that cancels the old reminder (EF-2, CA-2).
   */
  quiz: z
    .object({
      slotId: Uuid,
      startsAt: IsoDateTime,
      moduleTitle: z.string().trim().min(1).max(120).optional(),
    })
    .optional(),
});
export type DevNotificationsGenerationInput = z.infer<typeof DevNotificationsGenerationInput>;

export const DevNotificationsGenerationOutput = z.object({
  notifications: z.array(ProducedNotification),
  reminder: z
    .object({
      /** Null when the eligibility instant already passed: no reminder is created (CL-5). */
      notificationId: Uuid.nullable(),
      created: z.boolean(),
      schedule: ValidationQuizReminderSchedule,
      /** Old unsent reminders of the same slot removed by the move (EF-2, CA-2). */
      cancelled: z.number().int().min(0),
    })
    .nullable(),
});
export type DevNotificationsGenerationOutput = z.infer<typeof DevNotificationsGenerationOutput>;

/** ET-1 — demonstration generation; requires an `Idempotency-Key` (ADR-0120). */
export const devNotificationsGenerate = defineRoute({
  id: 'dev.notificationsGenerate',
  method: 'POST',
  path: '/api/v1/dev/sdd/notifications/generate',
  auth: 'user',
  body: DevNotificationsGenerationInput,
  output: DevNotificationsGenerationOutput,
  successStatus: 201,
  idempotent: true,
  summary:
    'Route de démonstration : génère les notifications des treize producteurs et un rappel de quiz (SPEC-706).',
  errors: [
    'VALIDATION_FAILED',
    'NOT_FOUND',
    'CONFLICT',
    'UNAUTHENTICATED',
    'IDEMPOTENCY_IN_PROGRESS',
  ],
});

export const notificationsGenerationDevRoutes = { devNotificationsGenerate } as const;

/** The producer type of each notification type of BR-NOT-02, for tests and documentation. */
export const PRODUCER_TYPES = NOTIFICATION_PRODUCER_TYPES;

/** Guard used by the shared producer module: only the thirteen producer types are accepted. */
export const ProducerNotificationType = NotificationProducerType;
export const ProducerTypeSet: ReadonlySet<string> = new Set(NOTIFICATION_PRODUCER_TYPES);

/** Re-exported for callers that validate a raw type before building facts. */
export { NotificationType as ProducedNotificationTypeSchema };
