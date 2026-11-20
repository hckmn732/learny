export const DEFAULT_DESTINATION = '/accueil';
export const PROFILE_DELETION_DESTINATION = '/parametres#profil';
export const ONBOARDING_BLOCKING_STEPS = ['profil', 'rythme', 'ia', 'rappels', 'depart'] as const;

export interface DestinationProfile {
  onboardingStep: string;
  deletionScheduledFor: Date | string | null;
}

export function isSafeNextPath(value: string | undefined | null): value is string {
  if (value === undefined || value === null || value.length === 0 || value.length > 512) {
    return false;
  }
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return false;
  // eslint-disable-next-line no-control-regex -- explicit rejection of control characters
  return !/[\u0000-\u001f\u007f]/u.test(value);
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
