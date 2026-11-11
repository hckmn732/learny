// Typed catalogue of Inngest events (docs/architecture/overview.md §5).
// Business events are added by SPEC-203; only the SDD demonstration exists for now.
import { eventType } from 'inngest';
import { z } from 'zod';

export const DEMO_VALUE_MIN = -1_000_000;
export const DEMO_VALUE_MAX = 1_000_000;
export const DEMO_RUN_ID_MAX = 64;

export const demoJobInputSchema = z.object({
  runId: z.string().trim().min(1).max(DEMO_RUN_ID_MAX),
  value: z.number().int().min(DEMO_VALUE_MIN).max(DEMO_VALUE_MAX),
  // Correlation identifier transmitted by the caller of the job (SPEC-010, EF-4).
  requestId: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/)
    .optional(),
});

export type DemoJobInput = z.infer<typeof demoJobInputSchema>;

export const EVENT_NAMES = {
  sddDemoJobRequested: 'sdd/demo-job.requested',
} as const;

export const sddDemoJobRequested = eventType(EVENT_NAMES.sddDemoJobRequested, {
  schema: demoJobInputSchema,
});

export const events = {
  [EVENT_NAMES.sddDemoJobRequested]: sddDemoJobRequested,
} as const;

export type EventName = keyof typeof events;
