import { conversationGet } from '@learny/contracts';
import { conversationById } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-610 ET-2 — reload one conversation; a foreign identifier is a plain 404 (RLS).
export const GET = handler(conversationGet, async ({ ctx, params }) =>
  conversationById(ctx, params.id),
);
