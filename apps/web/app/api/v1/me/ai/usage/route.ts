import { aiUsage } from '@learny/contracts';
import { getAiUsage } from '@learny/services/ai';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SPEC-507 EF-5 — spend, cap, percentage, next local midnight and history of the authenticated
// learner. The service reads through the user client, so RLS scopes every row to its owner.
export const GET = handler(aiUsage, ({ ctx, query }) => getAiUsage(ctx, query));
