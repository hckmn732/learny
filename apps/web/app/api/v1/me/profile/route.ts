import { meProfileGet, meProfileUpdate } from '@learny/contracts';
import { getSettingsState, updateSettingsProfile } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SPEC-707 ET-3 — the settings screen reads its full state and saves the profile and the rhythm
// in one transactional PATCH, under the learner's own RLS client.
export const GET = handler(meProfileGet, ({ ctx }) => getSettingsState(ctx));

export const PATCH = handler(meProfileUpdate, ({ ctx, body }) => updateSettingsProfile(ctx, body));
