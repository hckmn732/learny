import { suggestionsImport } from '@learny/contracts';
import { importSuggestion } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-607 BR-APP-05 — import is an explicit learner action, never an automatic fetch.
export const POST = handler(suggestionsImport, ({ ctx, params }) =>
  importSuggestion(ctx, params.rid),
);
