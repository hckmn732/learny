// Profile fields needed to decide where a signed-in learner goes (SPEC-202 EF-8, EF-9). The read
// goes through the learner's own session, so Row Level Security applies.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { DestinationProfile } from '@learny/services/destination';

const ProfileRow = z
  .object({ onboarding_step: z.string(), deletion_scheduled_for: z.string().nullable() })
  .nullable();

export async function loadProfileRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<DestinationProfile> {
  const { data } = await supabase
    .from('profiles')
    .select('onboarding_step, deletion_scheduled_for')
    .eq('id', userId)
    .maybeSingle();
  const parsed = ProfileRow.safeParse(data);
  const profile = parsed.success ? parsed.data : null;
  return {
    onboardingStep: profile?.onboarding_step ?? 'profil',
    deletionScheduledFor: profile?.deletion_scheduled_for ?? null,
  };
}
