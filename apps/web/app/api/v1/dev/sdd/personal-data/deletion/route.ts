import { devPersonalDataDeletion, devPersonalDataDeletionCancel } from '@learny/contracts';
import { cancelDeletionDemo, runDeletionDemo } from '@learny/services';

import { devOnly } from '../../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SPEC-211 EF-9: schedule and cancel through the real service, with the e-mail outbox preview.
export const POST = devOnly(handler(devPersonalDataDeletion, ({ ctx }) => runDeletionDemo(ctx)));

export const DELETE = devOnly(
  handler(devPersonalDataDeletionCancel, ({ ctx }) => cancelDeletionDemo(ctx)),
);
