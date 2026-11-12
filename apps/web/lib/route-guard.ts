// Decision of the page proxy (SPEC-202 EF-9, ET-6, ADR-0121): who may see which page. Pure and
// asynchronous only for the profile lookup, so it is tested without Next or Supabase.
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
  /** Value of the `lr-onboarded` cookie. */
  onboardedCookie: string | undefined;
}

export type GuardDecision =
  | { kind: 'pass'; markOnboarded?: string }
  | { kind: 'redirect'; to: string; markOnboarded?: string };

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

  if (isOnboardingPath(pathname) || input.onboardedCookie === userId) return { kind: 'pass' };

  const profile = await loadProfile();
  if ((ONBOARDED_STEPS as readonly string[]).includes(profile.onboardingStep)) {
    return { kind: 'pass', markOnboarded: userId };
  }
  return { kind: 'redirect', to: `${ONBOARDING_PREFIX}/${profile.onboardingStep}` };
}
