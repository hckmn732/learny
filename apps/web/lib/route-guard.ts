// Decision of the page proxy (SPEC-202 EF-9, ET-6, ADR-0121; SPEC-602 ET-3, ADR-0160): who may
// see which page. Pure and asynchronous only for the profile lookup, so it is tested without Next
// or Supabase. The signed `learny_ob` ticket may carry the step for 60 seconds; the profile stays
// the source of truth once it expires or after any onboarding PATCH.
import type { OnboardingStep } from '@learny/contracts';
import {
  isSafeNextPath,
  resolvePostAuthDestination,
  type DestinationProfile,
} from '@learny/services/destination';

export const SIGN_IN_PATH = '/connexion';
export const SIGN_UP_PATH = '/inscription';
export const ONBOARDING_PREFIX = '/premiers-pas';
export const HOME_PATH = '/accueil';

/** Onboarding steps that give access to the application (BR-ACC-04, ADR-0121). */
export const ONBOARDED_STEPS = ['rappels', 'depart', 'done'] as const;

const PUBLIC_EXACT = new Set([
  '/',
  SIGN_IN_PATH,
  SIGN_UP_PATH,
  '/verifier-email',
  '/hors-ligne',
  '/openapi.json',
]);
const PUBLIC_PREFIXES = ['/legal/', '/invitation/'];

export interface GuardInput {
  pathname: string;
  search: string;
  userId: string | null;
  /** Step read from a valid, unexpired `learny_ob` ticket of this user. */
  cachedStep?: OnboardingStep | undefined;
}

export type GuardDecision =
  | { kind: 'pass'; cacheStep?: OnboardingStep }
  | { kind: 'redirect'; to: string; cacheStep?: OnboardingStep };

export type ProfileLoader = () => Promise<DestinationProfile>;

function isPublic(pathname: string): boolean {
  return (
    PUBLIC_EXACT.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

function isOnboardingPath(pathname: string): boolean {
  return pathname === ONBOARDING_PREFIX || pathname.startsWith(`${ONBOARDING_PREFIX}/`);
}

export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function opensApplication(step: OnboardingStep): boolean {
  return (ONBOARDED_STEPS as readonly string[]).includes(step);
}

export async function decideRoute(
  input: GuardInput,
  loadProfile: ProfileLoader,
): Promise<GuardDecision> {
  const { pathname, userId } = input;
  if (isApiPath(pathname)) return { kind: 'pass' };

  // `/` stays the public landing page until SPEC-601; a signed-in learner goes to the app.
  if (pathname === '/') {
    return userId === null ? { kind: 'pass' } : { kind: 'redirect', to: HOME_PATH };
  }

  if (pathname === SIGN_IN_PATH || pathname === SIGN_UP_PATH) {
    if (userId === null) return { kind: 'pass' };
    const suite = new URLSearchParams(input.search).get('suite') ?? undefined;
    const profile = await loadProfile();
    return {
      kind: 'redirect',
      to: resolvePostAuthDestination(profile, isSafeNextPath(suite) ? suite : undefined),
    };
  }

  if (isPublic(pathname)) return { kind: 'pass' };

  if (userId === null) {
    const suite = encodeURIComponent(`${pathname}${input.search}`);
    return { kind: 'redirect', to: `${SIGN_IN_PATH}?suite=${suite}` };
  }

  // Onboarding pages themselves are always reachable; the server page applies EF-1 (later step →
  // redirect to the stored step, earlier step → editable).
  if (isOnboardingPath(pathname)) return { kind: 'pass' };

  // A valid ticket avoids the database read and is refreshed by the proxy when it expires.
  if (input.cachedStep !== undefined) {
    return opensApplication(input.cachedStep)
      ? { kind: 'pass' }
      : { kind: 'redirect', to: `${ONBOARDING_PREFIX}/${input.cachedStep}` };
  }

  const profile = await loadProfile();
  const step = profile.onboardingStep as OnboardingStep;
  return opensApplication(step)
    ? { kind: 'pass', cacheStep: step }
    : { kind: 'redirect', to: `${ONBOARDING_PREFIX}/${step}`, cacheStep: step };
}
