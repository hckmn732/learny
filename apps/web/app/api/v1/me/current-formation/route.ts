import { formationManagementRoutes } from '@learny/contracts';
import { switchCurrentFormation } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-618 — the current formation is persisted in the profile, never only in localStorage.
export const PATCH = handler(formationManagementRoutes.currentFormationUpdate, ({ ctx, body }) =>
  switchCurrentFormation(ctx, body),
);
