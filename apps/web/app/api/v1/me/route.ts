import { meGet, meUpdate } from '@learny/contracts';
import { getMe, updateProfile } from '@learny/services';

import { handler } from '../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SPEC-601 EF-10 — the verification screen reads the profile to choose the next onboarding step.
// SPEC-602 EF-3 to EF-7 — the same DTO is written by the first step, under RLS.
export const GET = handler(meGet, ({ ctx }) => getMe(ctx));

export const PATCH = handler(meUpdate, ({ ctx, body }) => updateProfile(ctx, body));
