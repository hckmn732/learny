import { z } from 'zod';

import { defineRoute } from './define-route';

// Contracts of the fixed application header (SPEC-305 ET-1, ET-4; BR-NAV-01, BR-ACC-09).
// The header reads the identity of the authenticated learner, the number of active formations
// and the unread notification count from one authenticated route. The full e-mail never leaves
// the server: `emailLabel` is already abbreviated for the fallback identity (CL-1).

export const HeaderDto = z.object({
  /** Profile first name, or null when the learner has not filled it in. */
  firstName: z.string().min(1).max(60).nullable(),
  /** Profile last name, used with the first name for the avatar initials. */
  lastName: z.string().min(1).max(60).nullable(),
  /** Abbreviated address shown when no first name exists; the full address stays server-side. */
  emailLabel: z.string().min(1).max(254).nullable(),
  /** Active formations only: paused or completed formations never count (EF-4). */
  activeFormationCount: z.number().int().min(0),
  /** Notifications of the learner whose `read_at` is null (BR-NOT-01). */
  unreadNotificationCount: z.number().int().min(0),
});
export type HeaderDto = z.infer<typeof HeaderDto>;

export const headerGet = defineRoute({
  id: 'header.get',
  method: 'GET',
  path: '/api/v1/me/header',
  auth: 'user',
  output: HeaderDto,
  successStatus: 200,
  summary:
    'En-tête du seul utilisateur connecté : prénom, adresse abrégée de repli, formations actives et notifications non lues (SPEC-305).',
  errors: ['UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR'],
});

export const headerRoutes = { headerGet } as const;
