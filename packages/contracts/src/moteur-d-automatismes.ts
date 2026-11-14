import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';
import { EVENT_AUTOMATION_KEYS } from './events';

// Contracts of the automation engine (SPEC-711 ET-1 to ET-5, ADR-0190). The definitions of the ten
// automations live in `@learny/automations` (SPEC-712 to SPEC-721); this module fixes the shared
// vocabulary: the six statuses of the journal, the kind of an action, the settings per learner and
// the routes `/me/automations` and `/me/automation-actions` (BR-AUT-11, BR-AUT-12).

export const AUTOMATION_ACTION_STATUSES = [
  'pending_consent',
  'applied',
  'declined',
  'undone',
  'expired',
  'consumed',
] as const;
export const AutomationActionStatus = z.enum(AUTOMATION_ACTION_STATUSES);
export type AutomationActionStatus = z.infer<typeof AutomationActionStatus>;

/** The ten keys of V1 (ADR-0190), already mirrored by the database enumeration. */
export const AutomationKey = z.enum(EVENT_AUTOMATION_KEYS);
export type AutomationKey = z.infer<typeof AutomationKey>;
export const AUTOMATION_KEY_VALUES = EVENT_AUTOMATION_KEYS;

/** ADR-0190 §4 — every specification 712 to 721 declares its own `snake_case` kinds. */
export const AutomationActionKind = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9_]*$/, 'type d’action snake_case attendu');
export type AutomationActionKind = z.infer<typeof AutomationActionKind>;

/** ET-3 — the one-line explanation is capped at 160 characters; the database allows 300. */
export const AutomationSummary = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((value) => !/[\r\n]/.test(value), 'une seule ligne, sans retour à la ligne');
export type AutomationSummary = z.infer<typeof AutomationSummary>;

/** Free JSON object carried by an action (`payload.dedupeKey`, `payload.choice`, …). */
export const AutomationPayload = z.record(z.string(), z.unknown());
export type AutomationPayload = z.infer<typeof AutomationPayload>;

/** One journal entry as returned to the interface (EF-2). */
export const AutomationActionItem = z.object({
  id: Uuid,
  automation: AutomationKey,
  kind: AutomationActionKind,
  summary: z.string().min(1),
  formationId: Uuid.nullable(),
  payload: AutomationPayload,
  undoPayload: AutomationPayload.nullable(),
  requiresConsent: z.boolean(),
  status: AutomationActionStatus,
  decidedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type AutomationActionItem = z.infer<typeof AutomationActionItem>;

/** EF-3, BR-AUT-12 — one page of the journal, newest first, with the weekly counter. */
export const AutomationActionPageDto = z.object({
  items: z.array(AutomationActionItem),
  weekCount: z.number().int().min(0),
  nextCursor: z.string().nullable(),
});
export type AutomationActionPageDto = z.infer<typeof AutomationActionPageDto>;

/** One setting as returned to the interface (EF-3); `params` is the stored, validated object. */
export const AutomationSettingItem = z.object({
  automation: AutomationKey,
  enabled: z.boolean(),
  params: AutomationPayload,
  updatedAt: IsoDateTime.nullable(),
});
export type AutomationSettingItem = z.infer<typeof AutomationSettingItem>;

/** The ten settings, plus the global pause state (CL-5: suspended while a pause is active). */
export const AutomationSettingsDto = z.object({
  items: z.array(AutomationSettingItem),
  paused: z.boolean(),
});
export type AutomationSettingsDto = z.infer<typeof AutomationSettingsDto>;

export const AutomationSettingDto = AutomationSettingItem;
export type AutomationSettingDto = AutomationSettingItem;

/** ET-5 — at least one field: `enabled` alone, or `params` alone, or both. */
export const AutomationSettingsUpdateBody = z
  .object({
    automation: AutomationKey,
    enabled: z.boolean().optional(),
    params: AutomationPayload.optional(),
  })
  .refine((value) => value.enabled !== undefined || value.params !== undefined, {
    path: ['enabled'],
    message: 'fournir au moins « enabled » ou « params »',
  });
export type AutomationSettingsUpdateBody = z.infer<typeof AutomationSettingsUpdateBody>;

/** ET-5 — filters of the journal read; `since` is a canonical ISO instant. */
export const AutomationActionListQuery = z.object({
  status: AutomationActionStatus.optional(),
  kind: AutomationActionKind.optional(),
  automation: AutomationKey.optional(),
  formationId: Uuid.optional(),
  since: IsoDateTime.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(300).optional(),
});
export type AutomationActionListQuery = z.infer<typeof AutomationActionListQuery>;

export const AutomationActionParams = z.object({ id: Uuid });
export type AutomationActionParams = z.infer<typeof AutomationActionParams>;

/** ADR-0190 §3 — the free object validated by the schema of the kind, e.g. `{ startsAt }`. */
export const AutomationAcceptBody = z.object({
  choice: AutomationPayload.optional(),
});
export type AutomationAcceptBody = z.infer<typeof AutomationAcceptBody>;

/** ET-5 — the ten settings of the connected learner, with their default values. */
export const meAutomationsList = defineRoute({
  id: 'me.automations.list',
  method: 'GET',
  path: '/api/v1/me/automations',
  auth: 'user',
  output: AutomationSettingsDto,
  successStatus: 200,
  summary:
    'Lit les dix réglages d’automatismes du seul utilisateur connecté et l’état de la pause globale (SPEC-711).',
  errors: ['UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR'],
});

/** ET-5 — validates the parameters with the schema of the automation, then upserts the row. */
export const meAutomationsUpdate = defineRoute({
  id: 'me.automations.update',
  method: 'PATCH',
  path: '/api/v1/me/automations',
  auth: 'user',
  body: AutomationSettingsUpdateBody,
  output: AutomationSettingDto,
  successStatus: 200,
  summary:
    'Active, désactive ou reparamètre un automatisme du seul utilisateur connecté (SPEC-711).',
  errors: ['VALIDATION_FAILED', 'UNAUTHENTICATED', 'NOT_FOUND'],
});

/** ET-5, BR-AUT-12 — the journal of the connected learner, newest first, with the week counter. */
export const meAutomationActionsList = defineRoute({
  id: 'me.automation-actions.list',
  method: 'GET',
  path: '/api/v1/me/automation-actions',
  auth: 'user',
  query: AutomationActionListQuery,
  output: AutomationActionPageDto,
  successStatus: 200,
  summary:
    'Journal des actions automatiques du seul utilisateur connecté, filtrable et paginé par curseur (SPEC-711).',
  errors: ['VALIDATION_FAILED', 'UNAUTHENTICATED', 'INTERNAL_ERROR'],
});

/** ET-5, EF-2 — accepts a pending action; `choice` is passed to the effect (`payload.choice`). */
export const meAutomationActionAccept = defineRoute({
  id: 'me.automation-actions.accept',
  method: 'POST',
  path: '/api/v1/me/automation-actions/:id/accept',
  auth: 'user',
  params: AutomationActionParams,
  body: AutomationAcceptBody,
  output: AutomationActionItem,
  successStatus: 200,
  idempotent: true,
  summary:
    'Accorde le consentement d’une action en attente du seul utilisateur connecté (SPEC-711).',
  errors: [
    'VALIDATION_FAILED',
    'NOT_FOUND',
    'CONFLICT',
    'IDEMPOTENCY_KEY_REQUIRED',
    'IDEMPOTENCY_IN_PROGRESS',
    'UNAUTHENTICATED',
    'INTERNAL_ERROR',
  ],
});

/** ET-5 — declines a pending action; the row stays in the journal (BR-AUT-12). */
export const meAutomationActionDecline = defineRoute({
  id: 'me.automation-actions.decline',
  method: 'POST',
  path: '/api/v1/me/automation-actions/:id/decline',
  auth: 'user',
  params: AutomationActionParams,
  output: AutomationActionItem,
  successStatus: 200,
  idempotent: true,
  summary: 'Refuse une action en attente du seul utilisateur connecté (SPEC-711).',
  errors: [
    'VALIDATION_FAILED',
    'NOT_FOUND',
    'CONFLICT',
    'IDEMPOTENCY_KEY_REQUIRED',
    'IDEMPOTENCY_IN_PROGRESS',
    'UNAUTHENTICATED',
    'INTERNAL_ERROR',
  ],
});

/** ET-5, CL-4 — undoes an applied action, refused once the effect was consumed (422). */
export const meAutomationActionUndo = defineRoute({
  id: 'me.automation-actions.undo',
  method: 'POST',
  path: '/api/v1/me/automation-actions/:id/undo',
  auth: 'user',
  params: AutomationActionParams,
  output: AutomationActionItem,
  successStatus: 200,
  idempotent: true,
  summary:
    'Annule une action appliquée du seul utilisateur connecté tant qu’elle n’est pas consommée (SPEC-711).',
  errors: [
    'VALIDATION_FAILED',
    'NOT_FOUND',
    'CONFLICT',
    'AUTOMATION_ACTION_CONSUMED',
    'IDEMPOTENCY_KEY_REQUIRED',
    'IDEMPOTENCY_IN_PROGRESS',
    'UNAUTHENTICATED',
    'INTERNAL_ERROR',
  ],
});

export const automationRoutes = {
  meAutomationsList,
  meAutomationsUpdate,
  meAutomationActionsList,
  meAutomationActionAccept,
  meAutomationActionDecline,
  meAutomationActionUndo,
} as const;
