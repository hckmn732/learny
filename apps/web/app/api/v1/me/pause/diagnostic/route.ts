import { mePauseDiagnostic } from '@learny/contracts';
import { completePauseDiagnostic } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-721 ET-4 — a real diagnostic result resumes and replans; without an answer nothing moves.
export const POST = handler(mePauseDiagnostic, ({ ctx, body }) =>
  completePauseDiagnostic(ctx, body),
);
