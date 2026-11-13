import { devEmailOutbox, devEmailOutboxPurge } from '@learny/contracts';
import { listDemoOutbox, purgeDemoOutbox } from '@learny/services';

import { devOnly } from '../../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// Demonstration route of SPEC-204: messages of the memory transport (empty with another transport).
export const GET = devOnly(handler(devEmailOutbox, () => Promise.resolve(listDemoOutbox())));
// The outbox is process-wide: the visual scenarios empty it to capture a reproducible state.
export const DELETE = devOnly(
  handler(devEmailOutboxPurge, () => Promise.resolve(purgeDemoOutbox())),
);
