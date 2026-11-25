// `learny://onboarding-termine` (QA hot fix 2026-11-25): the end of the web onboarding comes back
// here; the guard of the connected group re-reads the configuration and opens the application.
import { Redirect } from 'expo-router';

export default function OnboardingTermineRoute() {
  return <Redirect href="/(app)/aujourdhui" />;
}
