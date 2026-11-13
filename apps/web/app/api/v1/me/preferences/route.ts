import { mePreferencesGet, mePreferencesUpdate } from '@learny/contracts';
import { getStudyPreferences, updateStudyPreferences } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SPEC-602 EF-4 — rhythm read and replace, with the learner's RLS client.
export const GET = handler(mePreferencesGet, ({ ctx }) => getStudyPreferences(ctx));

export const PATCH = handler(mePreferencesUpdate, ({ ctx, body }) =>
  updateStudyPreferences(ctx, body),
);
