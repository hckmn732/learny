import { devEventsOutbox } from '@learny/contracts';
import { getOutboxCounts } from '@learny/services';

import { devOnly } from '../../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// Demonstration route of SPEC-203: counts of the caller's outbox rows.
export const GET = devOnly(handler(devEventsOutbox, ({ ctx }) => getOutboxCounts(ctx)));
