import { offlineSync } from '@learny/contracts';
import { syncOfflineAnswers } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-801 ET-6 — idempotent synchronisation of the answers given offline (clientId receipts).
export const POST = handler(offlineSync, ({ ctx, body }) => syncOfflineAnswers(ctx, body.entries));
