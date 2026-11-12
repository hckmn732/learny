// `timer` brick (SPEC-501 ET-3): a duration scoped to the whole activity or to listed bricks.
// `warnAtSec` defaults to the smaller of 300 s and the duration (ADR-0289), so a 30 s timer keeps a
// coherent warning point instead of an out-of-bound default.
import { z } from 'zod';

import { integer, sourcesSchema, uuid } from '../../common';

const timerBaseSchema = z
  .object({
    durationSec: integer(30, 14400),
    scope: z.enum(['activity', 'items']),
    itemBrickIds: z.array(uuid).max(100).default([]),
    warnAtSec: integer(0, 14400).optional(),
    autoSubmit: z.boolean().default(true),
    sources: sourcesSchema,
  })
  .strict()
  .refine((timer) => timer.warnAtSec === undefined || timer.warnAtSec <= timer.durationSec, {
    message: 'warnAtSec must not exceed durationSec.',
    path: ['warnAtSec'],
  });

export const timerSchema = timerBaseSchema.transform((timer) => ({
  ...timer,
  warnAtSec: timer.warnAtSec ?? Math.min(300, timer.durationSec),
}));

export type TimerPayload = z.infer<typeof timerSchema>;
