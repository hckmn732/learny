// Props of the eight e-mail templates (SPEC-204 ET-2). Date and duration labels are formatted by
// the caller with `Intl.DateTimeFormat('fr-FR', { timeZone })`: a template never computes a date.
import { z } from 'zod';

const firstName = z.string().max(60).nullable();

export const EMAIL_PROPS_SCHEMAS = {
  welcome: z.object({ firstName }),
  daily_digest: z.object({
    firstName,
    dateLabel: z.string(),
    plannedLabel: z.string(),
    activities: z
      .array(
        z.object({
          time: z.string().regex(/^\d{2}:\d{2}$/),
          title: z.string(),
          detail: z.string(),
          formationTitle: z.string(),
        }),
      )
      .max(20),
    globalQuiz: z
      .object({
        notions: z.number().int().min(1),
        minutes: z.number().int().min(1),
        formationTitle: z.string(),
      })
      .nullable(),
    held: z
      .object({
        count: z.number().int().min(1),
        maxPerDay: z.union([z.literal(3), z.literal(5), z.literal(8)]),
        titles: z.array(z.string()).max(10),
      })
      .nullable(),
  }),
  reminder: z.object({
    title: z.string().max(120),
    body: z.string().max(400),
    href: z.string().startsWith('/'),
    ctaLabel: z.string().max(40).optional(),
    formationTitle: z.string().nullable(),
  }),
  weekly_review: z.object({
    periodStartLabel: z.string(),
    periodEndLabel: z.string(),
    studyLabel: z.string(),
    retentionPercent: z.number().int().min(0).max(100).nullable(),
    atRiskCount: z.number().int().min(0),
    succeeded: z.string(),
    atRisk: z.string(),
    nextWeek: z.string(),
  }),
  ai_task_failed: z.object({
    taskLabel: z.string(),
    modelLabel: z.string(),
    subject: z.string().max(120),
    managedAvailable: z.boolean(),
  }),
  export_ready: z.object({
    downloadUrl: z.url(),
    sizeLabel: z.string(),
    expiresLabel: z.string(),
  }),
  deletion_scheduled: z.object({ scheduledLabel: z.string() }),
  deletion_completed: z.object({ requestedLabel: z.string() }),
} as const;

export type EmailTemplateKey = keyof typeof EMAIL_PROPS_SCHEMAS;

export const EMAIL_TEMPLATE_KEYS = Object.keys(EMAIL_PROPS_SCHEMAS) as readonly EmailTemplateKey[];

export type EmailProps<K extends EmailTemplateKey> = z.infer<(typeof EMAIL_PROPS_SCHEMAS)[K]>;

export function isEmailTemplateKey(value: unknown): value is EmailTemplateKey {
  return typeof value === 'string' && Object.hasOwn(EMAIL_PROPS_SCHEMAS, value);
}
