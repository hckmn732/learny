import { meGet } from '@learny/contracts';
import { getMe } from '@learny/services';

import { handler } from '../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-601 EF-10 — the verification screen reads the profile to choose the next onboarding step.
// RLS keeps another learner's profile out of the DTO.
export const GET = handler(meGet, ({ ctx }) => getMe(ctx));
