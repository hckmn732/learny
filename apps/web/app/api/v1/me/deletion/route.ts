import { meDeletionCancel, meDeletionSchedule } from '@learny/contracts';
import { cancelDeletion, scheduleDeletion } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SPEC-211 EF-5: schedules the deletion at J+30; a replay returns the same deadline, no second e-mail.
export const POST = handler(meDeletionSchedule, ({ ctx }) => scheduleDeletion(ctx));

// SPEC-211 EF-6: cancels it; without a pending request the answer is still 204.
export const DELETE = handler(meDeletionCancel, async ({ ctx }) => {
  const result = await cancelDeletion(ctx);
  return result.ok ? undefined : result;
});
