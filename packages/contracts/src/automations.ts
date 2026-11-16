import { z } from 'zod';

// Contracts of the first automation series (SPEC-712 ET-1, ADR-0190 §4). The engine of SPEC-711
// owns the shared vocabulary; every specification 712 to 721 adds its own `snake_case` kinds and
// the Zod schema of its parameters here, so the settings service validates them and the journal
// can group them.

/** ET-1 — kinds produced by the `reprise` automation (ADR-0192 §4). */
export const REPRISE_ACTION_KINDS = [
  'slot_rescheduled',
  'reprise_proposed',
  'reprise_short_proposed',
  'plan_change_proposed',
] as const;
export const RepriseActionKind = z.enum(REPRISE_ACTION_KINDS);
export type RepriseActionKind = z.infer<typeof RepriseActionKind>;

/**
 * EF-1 — parameters of the automation, always `lightenDays > inactiveDays` so the two proposals
 * never fire on the same morning (BR-AUT-01).
 */
export const RepriseParams = z
  .object({
    inactiveDays: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2),
    lightenDays: z.union([z.literal(4), z.literal(5), z.literal(7)]).default(5),
    mode: z.enum(['auto', 'accord']).default('accord'),
  })
  .refine((params) => params.lightenDays > params.inactiveDays, {
    path: ['lightenDays'],
    message: 'le seuil d’allègement doit être supérieur au seuil de reprise',
  });
export type RepriseParams = z.infer<typeof RepriseParams>;

/** ET-1, ADR-0190 §3 — the accepted choice: another proposed instant, or a plan option. */
export const RepriseChoice = z.union([
  z.object({ startsAt: z.iso.datetime({ offset: true }) }),
  z.object({ option: z.enum(['shift_end', 'lighten']) }),
]);
export type RepriseChoice = z.infer<typeof RepriseChoice>;

/** ET-1 — kind produced by the `echauffement` automation (SPEC-714 EF-4). */
export const ECHAUFFEMENT_ACTION_KINDS = ['warmup_added'] as const;
export const EchauffementActionKind = z.enum(ECHAUFFEMENT_ACTION_KINDS);
export type EchauffementActionKind = z.infer<typeof EchauffementActionKind>;

/** ET-1 — legacy value of `AUTOMATION_DEFAULTS.echauffement.scope` before the V1 wording. */
const LEGACY_WARMUP_SCOPE = 'yesterday_and_prerequisites';

/**
 * ET-1, EF-1 — parameters of the warm-up: two, three (default) or five questions, over the
 * previous study day alone or with the prerequisites of the upcoming chapter. The stored defaults
 * of the identity trigger use the older `questionCount`/`yesterday_and_prerequisites` names, so the
 * schema accepts them as aliases and always emits the canonical keys (ADR-0327).
 */
export const EchauffementParams = z.preprocess(
  (value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
    const raw = value as Record<string, unknown>;
    const next: Record<string, unknown> = { ...raw };
    if (next.count === undefined && raw.questionCount !== undefined) next.count = raw.questionCount;
    if (next.scope === LEGACY_WARMUP_SCOPE) next.scope = 'yesterday_prerequisites';
    delete next.questionCount;
    return next;
  },
  z.object({
    count: z.union([z.literal(2), z.literal(3), z.literal(5)]).default(3),
    scope: z.enum(['yesterday_prerequisites', 'yesterday']).default('yesterday_prerequisites'),
  }),
);
export type EchauffementParams = z.infer<typeof EchauffementParams>;

/** EF-2, ET-1 — kind produced by the `remediation` automation (SPEC-715 EF-3). */
export const REMEDIATION_ACTION_KINDS = ['remediation_ready'] as const;
export const RemediationActionKind = z.enum(REMEDIATION_ACTION_KINDS);
export type RemediationActionKind = z.infer<typeof RemediationActionKind>;

/**
 * ET-1 — delay and mode of automation 4 (SPEC-715 EF-1). The canonical keys are `delayHours` and
 * `mandatory`; the legacy names `retryDelayHours` and `required` of SPEC-612 are accepted as
 * aliases so the settings stored before this specification keep working (ADR-0190 §5).
 */
export const RemediationParams = z.preprocess(
  (value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
    const raw = value as Record<string, unknown>;
    const next: Record<string, unknown> = { ...raw };
    if (next.delayHours === undefined && raw.retryDelayHours !== undefined) {
      next.delayHours = raw.retryDelayHours;
    }
    if (next.mode === 'required') next.mode = 'mandatory';
    delete next.retryDelayHours;
    return next;
  },
  z.object({
    delayHours: z.union([z.literal(0), z.literal(12), z.literal(24), z.literal(48)]).default(24),
    mode: z.enum(['advised', 'mandatory']).default('advised'),
  }),
);
export type RemediationParams = z.infer<typeof RemediationParams>;

/** EF-6 — one of the two options a `plan_change_proposed` action exposes (BR-FOR-14). */
export const ReprisePlanOption = z.object({
  kind: z.enum(['shift_end', 'lighten']),
  feasible: z.boolean(),
  reason: z.string().max(300).nullable(),
  currentEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  projectedEndDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  extraDays: z.number().int().nullable(),
  currentHoursPerDay: z.number().min(1).max(6),
  newHoursPerDay: z.number().min(1).max(6).nullable(),
  removedMinutes: z.number().int().nullable(),
});
export type ReprisePlanOption = z.infer<typeof ReprisePlanOption>;
