import { meOnboardingUpdate } from '@learny/contracts';
import { advanceOnboarding } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';
import { ONBOARDED_COOKIE, expireCookie } from '../../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SPEC-602 ET-3 — each step change invalidates the signed step ticket; the next page render reads
// the profile again and caches the new step for at most 60 seconds (ADR-0160).
export const PATCH = handler(meOnboardingUpdate, async ({ ctx, body }) => {
  const result = await advanceOnboarding(ctx, body);
  if (result.ok) expireCookie(ctx.request, ctx.responseHeaders, ONBOARDED_COOKIE);
  return result;
});
