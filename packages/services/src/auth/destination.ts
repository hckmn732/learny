// Where a learner lands after authenticating (SPEC-202 EF-8, ADR-0121, CL-4, CL-5, CL-6).
export const DEFAULT_DESTINATION = '/accueil';
export const PROFILE_DELETION_DESTINATION = '/parametres#profil';
export const ONBOARDING_BLOCKING_STEPS = ['profil', 'rythme', 'ia'] as const;

export interface DestinationProfile {
  onboardingStep: string;
  deletionScheduledFor: Date | string | null;
}

/** A relative path only: `/…`, never `//host`, never a backslash, 512 characters at most. */
export function isSafeNextPath(value: string | undefined | null): value is string {
  if (value === undefined || value === null) return false;
  if (value.length === 0 || value.length > 512) return false;
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (value.includes('\\')) return false;
  // Control characters (tab, newline…) are stripped by browsers and can hide a second slash.
  // eslint-disable-next-line no-control-regex -- explicit rejection of control characters
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  return true;
}

export function onboardingDestination(step: string): string | null {
  return (ONBOARDING_BLOCKING_STEPS as readonly string[]).includes(step)
    ? `/premiers-pas/${step}`
    : null;
}

export function resolvePostAuthDestination(profile: DestinationProfile, next?: string): string {
  if (profile.deletionScheduledFor !== null) return PROFILE_DELETION_DESTINATION;
  const onboarding = onboardingDestination(profile.onboardingStep);
  if (onboarding !== null) return onboarding;
  return isSafeNextPath(next) ? next : DEFAULT_DESTINATION;
}
