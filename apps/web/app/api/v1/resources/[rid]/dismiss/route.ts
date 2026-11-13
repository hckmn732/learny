import { suggestionsDismiss } from '@learny/contracts';
import { dismissSuggestion } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-607 BR-APP-05 — dismissing a suggestion creates neither a resource nor an event.
export const POST = handler(suggestionsDismiss, ({ ctx, params }) =>
  dismissSuggestion(ctx, params.rid),
);
