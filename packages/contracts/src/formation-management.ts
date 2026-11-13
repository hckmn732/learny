import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';
import { SidebarFormation } from './sidebar';

// Contracts of formation management (SPEC-618 EF-1 to EF-4, ET-1 to ET-5; BR-FOR-10,
// BR-FOR-11, BR-FOR-15, ADR-0016, ADR-0075). The same DTO feeds the switcher of the shell and
// the active-limit dialog: one transition answer always carries the refreshed state so the
// client never guesses the new current formation or the active count.

/** BR-FOR-10 — the active count is capped by `FORMATION_RULES.maxActiveFormations`. */
export const ACTIVE_FORMATION_LIMIT = 3;

/** EF-1 — active and paused formations, ordered current first then by last opening. */
export const FormationManagementState = z.object({
  currentFormationId: Uuid.nullable(),
  activeCount: z.number().int().min(0),
  formations: z.array(SidebarFormation),
});
export type FormationManagementState = z.infer<typeof FormationManagementState>;

export const FormationTransitionOutcome = z.enum(['applied', 'unchanged', 'limit']);
export type FormationTransitionOutcome = z.infer<typeof FormationTransitionOutcome>;

/** EF-3 — `limit` means nothing changed and the dialog must ask which formation to pause. */
export const FormationTransitionOutput = z.object({
  outcome: FormationTransitionOutcome,
  state: FormationManagementState,
  /** EF-3 — the formation paused during the same resume, when the learner chose one. */
  pausedFormationId: Uuid.nullable(),
});
export type FormationTransitionOutput = z.infer<typeof FormationTransitionOutput>;

/** EF-1, ET-5 — only an active formation can become the current one (BR-FOR-11). */
export const CurrentFormationUpdateInput = z.strictObject({
  formationId: Uuid,
});
export type CurrentFormationUpdateInput = z.infer<typeof CurrentFormationUpdateInput>;

/** EF-3 — an explicit pause accompanies the resume that would exceed three active formations. */
export const FormationResumeInput = z.strictObject({
  pauseFormationId: Uuid.optional(),
  /** CL-2 — optional optimistic-concurrency guard on the paused row. */
  expectedUpdatedAt: IsoDateTime.optional(),
});
export type FormationResumeInput = z.input<typeof FormationResumeInput>;

/** CL-2 — pause/archive accept the same optimistic-concurrency guard. */
export const FormationPauseInput = z.strictObject({
  expectedUpdatedAt: IsoDateTime.optional(),
});
export type FormationPauseInput = z.input<typeof FormationPauseInput>;

const idParams = z.object({ fid: Uuid });

export const formationManagementRoutes = {
  currentFormationUpdate: defineRoute({
    id: 'formations.current',
    method: 'PATCH',
    path: '/api/v1/me/current-formation',
    auth: 'user',
    body: CurrentFormationUpdateInput,
    output: FormationManagementState,
    successStatus: 200,
    summary:
      'Mémorise la formation courante (dernière formation active consultée) et renvoie l’état de gestion (SPEC-618).',
    errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'CONFLICT', 'UNAUTHENTICATED', 'INTERNAL_ERROR'],
  }),
  formationPause: defineRoute({
    id: 'formations.pause',
    method: 'POST',
    path: '/api/v1/formations/:fid/pause',
    auth: 'user',
    params: idParams,
    body: FormationPauseInput,
    output: FormationTransitionOutput,
    successStatus: 200,
    idempotent: true,
    summary:
      'Met une formation en pause, gèle ses créneaux futurs et choisit la formation courante restante (SPEC-618).',
    errors: [
      'VALIDATION_FAILED',
      'IDEMPOTENCY_KEY_REQUIRED',
      'NOT_FOUND',
      'CONFLICT',
      'UNAUTHENTICATED',
      'INTERNAL_ERROR',
    ],
  }),
  formationResume: defineRoute({
    id: 'formations.resume',
    method: 'POST',
    path: '/api/v1/formations/:fid/resume',
    auth: 'user',
    params: idParams,
    body: FormationResumeInput,
    output: FormationTransitionOutput,
    successStatus: 200,
    idempotent: true,
    summary:
      'Reprend une formation, la replanifie depuis le jour local et applique la limite de trois (SPEC-618).',
    errors: [
      'VALIDATION_FAILED',
      'IDEMPOTENCY_KEY_REQUIRED',
      'NOT_FOUND',
      'CONFLICT',
      'FORMATION_LIMIT_REACHED',
      'UNAUTHENTICATED',
      'INTERNAL_ERROR',
    ],
  }),
  formationArchive: defineRoute({
    id: 'formations.archive',
    method: 'POST',
    path: '/api/v1/formations/:fid/archive',
    auth: 'user',
    params: idParams,
    body: FormationPauseInput,
    output: FormationTransitionOutput,
    successStatus: 200,
    idempotent: true,
    summary:
      'Archive une formation active ou en pause, retire ses créneaux futurs et conserve son historique (SPEC-618).',
    errors: [
      'VALIDATION_FAILED',
      'IDEMPOTENCY_KEY_REQUIRED',
      'NOT_FOUND',
      'CONFLICT',
      'UNAUTHENTICATED',
      'INTERNAL_ERROR',
    ],
  }),
} as const;
