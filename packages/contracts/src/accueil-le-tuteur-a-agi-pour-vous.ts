import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';
import { AutomationActionKind, AutomationKey, AutomationActionItem } from './moteur-d-automatismes';

// Home card of the automations (SPEC-722, BR-AUT-13, ADR-0190). The banner reads the pending
// proposals (`pending_consent`) through `/me/automation-actions`; the card reads the recent
// applied or consumed actions, newest first, and offers « Annuler » only while the effect is not
// consumed. Nothing here duplicates the routes of SPEC-711: the DTO only projects their items.

/** The banner of « Le tuteur propose » reads only the actions waiting for consent. */
export const TUTOR_PROPOSAL_STATUSES = ['pending_consent'] as const;
export const TutorProposalStatus = z.enum(TUTOR_PROPOSAL_STATUSES);
export type TutorProposalStatus = z.infer<typeof TutorProposalStatus>;

/** The card of « Le tuteur a agi pour vous » reads the actions already applied or consumed. */
export const TUTOR_ACTIVITY_STATUSES = ['applied', 'consumed'] as const;
export const TutorActivityStatus = z.enum(TUTOR_ACTIVITY_STATUSES);
export type TutorActivityStatus = z.infer<typeof TutorActivityStatus>;

/** A card row can also be a pending proposal of another automation (ADR-0191 §1). */
export const TUTOR_CARD_STATUSES = ['pending_consent', 'applied', 'consumed'] as const;
export const TutorCardStatus = z.enum(TUTOR_CARD_STATUSES);
export type TutorCardStatus = z.infer<typeof TutorCardStatus>;

/** « Régler » always opens the automations section of the settings screen (SPEC-710). */
export const TUTOR_SETTINGS_HREF = '/parametres#automatismes';

/** The mockup shows at most five recent lines; the weekly journal keeps the full history. */
export const TUTOR_ACTIVITY_CARD_LIMIT = 5;

/** One line of the card: dated summary, target and the decision still possible. */
export const TutorActivityItem = z.object({
  id: Uuid,
  automation: AutomationKey,
  type: AutomationActionKind,
  summary: z.string().min(1),
  status: TutorCardStatus,
  requiresConsent: z.boolean(),
  createdAt: IsoDateTime,
  decidedAt: IsoDateTime.nullable(),
  /** Relative application path of the target, null once the target no longer exists (CL-5). */
  href: z
    .string()
    .regex(/^\/(?!\/)/, 'chemin relatif attendu')
    .nullable(),
  /** False for a consumed action: its effect was used and can no longer be undone. */
  canUndo: z.boolean(),
});
export type TutorActivityItem = z.infer<typeof TutorActivityItem>;

/** Pending proposals of the automations other than `reprise` stay in the card (ADR-0191 §1). */
export const TutorActivityFeedDto = z.object({
  proposals: z.array(TutorActivityItem),
  items: z.array(TutorActivityItem),
  /** BR-AUT-12 — « N actions cette semaine », refreshed with the card. */
  weekCount: z.number().int().min(0),
  nextCursor: z.string().nullable(),
});
export type TutorActivityFeedDto = z.infer<typeof TutorActivityFeedDto>;

/** Stable cursor of the card: newest first by `(createdAt, id)`. */
export const TutorActivityCursor = z.object({
  createdAt: IsoDateTime,
  id: Uuid,
});
export type TutorActivityCursor = z.infer<typeof TutorActivityCursor>;

export const TutorActivityListQuery = z.object({
  statuses: z
    .array(TutorActivityStatus)
    .min(1)
    .max(2)
    .default([...TUTOR_ACTIVITY_STATUSES]),
  limit: z.coerce.number().int().min(1).max(100).default(TUTOR_ACTIVITY_CARD_LIMIT),
  cursor: z.string().min(1).max(512).optional(),
});
export type TutorActivityListQuery = z.infer<typeof TutorActivityListQuery>;

/** The card projects a row of the SPEC-711 journal without changing any of its fields. */
export const TutorActivitySource = AutomationActionItem;
export type TutorActivitySource = z.infer<typeof TutorActivitySource>;
