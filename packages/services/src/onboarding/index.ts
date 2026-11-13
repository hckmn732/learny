// Public API of the onboarding service (SPEC-602 ET-2).
export {
  advanceOnboarding,
  getStudyPreferences,
  updateProfile,
  updateStudyPreferences,
} from './advance';
export type { OnboardingState, ReminderState } from './state';
export {
  ONBOARDING_AUTOMATION_KEYS,
  ONBOARDING_AUTOMATION_KEYS_SET,
  applyReminderChoices,
  applyReminderChoicesInTx,
  getOnboardingState,
  onboardingNeedsCheckout,
} from './state';
