import { billingSubscription } from '@learny/contracts';
import { getSubscription } from '@learny/services/billing';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SPEC-210 EF-3: status and end of the current period.
export const GET = handler(billingSubscription, ({ ctx }) => getSubscription(ctx));
