import { getQuizAttempt } from '@learny/contracts';
import { getAttempt } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-611 ET-2 — read model of one attempt; no correct answer before it is checked.
export const GET = handler(getQuizAttempt, ({ ctx, params }) => getAttempt(ctx, params.aid));
