import { z } from 'zod';

import { CivilDate, IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';

// Contract of the tenth automation (SPEC-721, BR-AUT-10, ADR-0016, ADR-0190).
//
// A learner declares a pause until a civil date in the profile time zone. The account pause row is
// distinct from the per-formation pause of SPEC-618 (ADR-0016): it freezes every active formation
// and keeps the paused days neutral in the streak. On return, a ten-minute diagnostic is proposed
// once when enabled (the default); only a real diagnostic result resumes and replans.

export const PAUSE_AUTOMATION = 'pause' as const;
export const PAUSE_ACTION_KINDS = ['pause_started', 'pause_ended'] as const;
export const PauseActionKind = z.enum(PAUSE_ACTION_KINDS);
export type PauseActionKind = z.infer<typeof PauseActionKind>;

export const PAUSE_STATUSES = ['active', 'ended', 'cancelled'] as const;
export const PauseStatus = z.enum(PAUSE_STATUSES);
export type PauseStatus = z.infer<typeof PauseStatus>;

/** ET-4 — deterministic selection of the notions at risk, limited to ten minutes. */
export const PauseDiagnostic = z.object({
  minutes: z.number().int().min(5).max(30),
  formationId: Uuid.nullable(),
  notionIds: z.array(Uuid),
  answered: z.number().int().min(0).nullable(),
  correct: z.number().int().min(0).nullable(),
  completedAt: IsoDateTime.nullable(),
});
export type PauseDiagnostic = z.infer<typeof PauseDiagnostic>;

/** EF-1 to EF-3 — one of `none|active|ended`, never an internal row. */
export const PauseStateDto = z.object({
  status: z.enum(['none', 'active', 'ended']),
  startsOn: CivilDate.nullable(),
  endsOn: CivilDate.nullable(),
  diagnosticOnReturn: z.boolean(),
  endedAt: IsoDateTime.nullable(),
  /** Formations frozen by this global pause; they are resumed by the diagnostic or directly. */
  pausedFormationIds: z.array(Uuid),
  /** EF-2 — the local return day is reached; a read finalizes the pause. */
  returnDue: z.boolean(),
  /** EF-2, ET-4 — the proposed diagnostic, then its real result. */
  diagnostic: PauseDiagnostic.nullable(),
});
export type PauseStateDto = z.infer<typeof PauseStateDto>;

/** EF-1, CL-3 — the end date is a civil day of the profile zone, never before today. */
export const PauseStartInput = z.strictObject({
  endDate: CivilDate,
  diagnosticEnabled: z.boolean().default(true),
});
export type PauseStartInput = z.infer<typeof PauseStartInput>;

/** ET-4, CL-5 — only a real result (at least one answer) triggers the replanification. */
export const PauseDiagnosticResultInput = z
  .strictObject({
    answered: z.number().int().min(0).max(100),
    correct: z.number().int().min(0).max(100),
  })
  .refine((value) => value.correct <= value.answered, {
    path: ['correct'],
    message: 'le nombre de réponses correctes ne dépasse pas le nombre de réponses',
  });
export type PauseDiagnosticResultInput = z.infer<typeof PauseDiagnosticResultInput>;

/** Payload of `pause_started` and `pause_ended` (ET-3), shared by the service and the journal. */
export const PauseActionPayload = z.object({
  dedupeKey: z.string().min(1).max(200),
  pauseId: Uuid,
  endDate: CivilDate,
  startsOn: CivilDate,
  diagnosticEnabled: z.boolean(),
  diagnosticMinutes: z.number().int().min(5).max(30).default(10),
  pausedFormationIds: z.array(Uuid).default([]),
});
export type PauseActionPayload = z.infer<typeof PauseActionPayload>;

/** GET /me/pause — the current or latest pause of the connected learner. */
export const mePauseGet = defineRoute({
  id: 'me.pause.get',
  method: 'GET',
  path: '/api/v1/me/pause',
  auth: 'user',
  output: PauseStateDto,
  successStatus: 200,
  summary:
    'Lit la pause globale du seul apprenant connecté et son diagnostic de retour (SPEC-721).',
  errors: ['UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR'],
});

/** POST /me/pause — declares a pause until the end date and freezes the planning. */
export const mePauseStart = defineRoute({
  id: 'me.pause.start',
  method: 'POST',
  path: '/api/v1/me/pause',
  auth: 'user',
  body: PauseStartInput,
  output: PauseStateDto,
  successStatus: 200,
  idempotent: true,
  summary:
    'Déclare une pause globale, gèle les créneaux futurs et rend les jours neutres pour la série (SPEC-721).',
  errors: [
    'VALIDATION_FAILED',
    'IDEMPOTENCY_KEY_REQUIRED',
    'IDEMPOTENCY_IN_PROGRESS',
    'NOT_FOUND',
    'CONFLICT',
    'UNAUTHENTICATED',
    'INTERNAL_ERROR',
  ],
});

/** DELETE /me/pause — resumes early (or on the return day) and proposes the diagnostic once. */
export const mePauseEnd = defineRoute({
  id: 'me.pause.end',
  method: 'DELETE',
  path: '/api/v1/me/pause',
  auth: 'user',
  output: PauseStateDto,
  successStatus: 200,
  summary:
    'Met fin à la pause, propose le diagnostic de dix minutes ou replanifie immédiatement (SPEC-721).',
  errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'CONFLICT', 'UNAUTHENTICATED', 'INTERNAL_ERROR'],
});

/** POST /me/pause/diagnostic — a real result replans; without an answer nothing moves (CL-5). */
export const mePauseDiagnostic = defineRoute({
  id: 'me.pause.diagnostic',
  method: 'POST',
  path: '/api/v1/me/pause/diagnostic',
  auth: 'user',
  body: PauseDiagnosticResultInput,
  output: PauseStateDto,
  successStatus: 200,
  idempotent: true,
  summary:
    'Enregistre le résultat réel du diagnostic de retour puis replanifie les formations reprises (SPEC-721).',
  errors: [
    'VALIDATION_FAILED',
    'IDEMPOTENCY_KEY_REQUIRED',
    'IDEMPOTENCY_IN_PROGRESS',
    'NOT_FOUND',
    'CONFLICT',
    'UNAUTHENTICATED',
    'INTERNAL_ERROR',
  ],
});

export const pauseRoutes = {
  mePauseGet,
  mePauseStart,
  mePauseEnd,
  mePauseDiagnostic,
} as const;
