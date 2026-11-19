import {
  meAiTaskModelsUpdate,
  meGet,
  meOnboardingUpdate,
  mePreferencesGet,
  mePreferencesUpdate,
  meUpdate,
} from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import {
  advanceOnboarding,
  getMe,
  getStudyPreferences,
  updateProfile,
  updateStudyPreferences,
} from '@learny/services';
import { assignTaskModel } from '@learny/services/ai/qualify';

import { ONBOARDED_COOKIE, expireCookie } from '../deps/supabase-server';

// SPEC-1004 ET-1 - implementations of the `me` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const meImplementations = {
  meAiTaskModelsUpdate: ({ ctx, body }: HandlerArgs<typeof meAiTaskModelsUpdate>) =>
    assignTaskModel(ctx, body),
  meOnboardingUpdate: async ({ ctx, body }: HandlerArgs<typeof meOnboardingUpdate>) => {
    const result = await advanceOnboarding(ctx, body);
    if (result.ok) expireCookie(ctx.request, ctx.responseHeaders, ONBOARDED_COOKIE);
    return result;
  },
  mePreferencesGet: ({ ctx }: HandlerArgs<typeof mePreferencesGet>) => getStudyPreferences(ctx),
  mePreferencesUpdate: ({ ctx, body }: HandlerArgs<typeof mePreferencesUpdate>) =>
    updateStudyPreferences(ctx, body),
  meGet: ({ ctx }: HandlerArgs<typeof meGet>) => getMe(ctx),
  meUpdate: ({ ctx, body }: HandlerArgs<typeof meUpdate>) => updateProfile(ctx, body),
};
