import { mePauseEnd, mePauseGet, mePauseStart } from '@learny/contracts';
import { endPause, getPauseState, startPause } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-721 — the global pause of the learner. The GET finalizes a pause whose return day is
// reached; the POST freezes the future slots; the DELETE resumes early and proposes the
// ten-minute diagnostic once (BR-AUT-10).
export const GET = handler(mePauseGet, ({ ctx }) => getPauseState(ctx));

export const POST = handler(mePauseStart, ({ ctx, body }) => startPause(ctx, body));

export const DELETE = handler(mePauseEnd, ({ ctx }) => endPause(ctx));
