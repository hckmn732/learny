import { describe, expect, it, vi } from 'vitest';

import { decideRoute, type GuardInput } from './route-guard';

const USER = '4b7c1c8e-6a0f-4d52-9d3e-6f9d1f0a1b11';

function input(pathname: string, overrides: Partial<GuardInput> = {}): GuardInput {
  return { pathname, search: '', userId: USER, cachedStep: undefined, ...overrides };
}

const profile = (step: string, deletion: string | null = null) =>
  vi.fn(() => Promise.resolve({ onboardingStep: step, deletionScheduledFor: deletion }));

describe('[SPEC-202] proxy — garde des pages', () => {
  it.each([
    '/connexion',
    '/inscription',
    '/verifier-email',
    '/legal/cgu',
    '/invitation/LRN-ABCD',
    '/hors-ligne',
    '/openapi.json',
  ])('lets an anonymous visitor reach the public page %s', async (pathname) => {
    const loader = profile('done');
    const decision = await decideRoute(input(pathname, { userId: null }), loader);
    expect(decision).toEqual({ kind: 'pass' });
    expect(loader).not.toHaveBeenCalled();
  });

  it('keeps `/` public for an anonymous visitor and sends a signed-in one home', async () => {
    expect(await decideRoute(input('/', { userId: null }), profile('done'))).toEqual({
      kind: 'pass',
    });
    expect(await decideRoute(input('/'), profile('done'))).toEqual({
      kind: 'redirect',
      to: '/accueil',
    });
  });

  it('sends an anonymous visitor of a protected page to /connexion with the encoded path (CA-5)', async () => {
    expect(await decideRoute(input('/accueil', { userId: null }), profile('done'))).toEqual({
      kind: 'redirect',
      to: '/connexion?suite=%2Faccueil',
    });
    expect(
      await decideRoute(
        input('/agenda', { userId: null, search: '?semaine=2&x=é' }),
        profile('done'),
      ),
    ).toEqual({
      kind: 'redirect',
      to: `/connexion?suite=${encodeURIComponent('/agenda?semaine=2&x=é')}`,
    });
  });

  it('never redirects an API path', async () => {
    for (const userId of [null, USER]) {
      expect(await decideRoute(input('/api/v1/me', { userId }), profile('profil'))).toEqual({
        kind: 'pass',
      });
    }
  });

  it('sends a signed-in learner away from the sign-in pages, to the destination (EF-9)', async () => {
    for (const pathname of ['/connexion', '/inscription']) {
      expect(await decideRoute(input(pathname), profile('done'))).toEqual({
        kind: 'redirect',
        to: '/accueil',
      });
      expect(await decideRoute(input(pathname), profile('rythme'))).toEqual({
        kind: 'redirect',
        to: '/premiers-pas/rythme',
      });
      expect(await decideRoute(input(pathname), profile('done', '2026-12-01T00:00:00Z'))).toEqual({
        kind: 'redirect',
        to: '/parametres#profil',
      });
    }
  });

  it('honours a safe `suite` and ignores an external one (CL-4)', async () => {
    expect(
      await decideRoute(input('/connexion', { search: '?suite=%2Fagenda' }), profile('done')),
    ).toEqual({
      kind: 'redirect',
      to: '/agenda',
    });
    expect(
      await decideRoute(
        input('/connexion', { search: '?suite=%2F%2Fevil.example' }),
        profile('done'),
      ),
    ).toEqual({ kind: 'redirect', to: '/accueil' });
  });

  it.each(['profil', 'rythme', 'ia'])(
    'keeps a learner at onboarding step %s inside /premiers-pas (CL-5, CA-5)',
    async (step) => {
      expect(await decideRoute(input('/agenda'), profile(step))).toEqual({
        kind: 'redirect',
        to: `/premiers-pas/${step}`,
        cacheStep: step,
      });
      expect(await decideRoute(input('/premiers-pas/rythme'), profile(step))).toEqual({
        kind: 'pass',
      });
    },
  );

  it.each(['rappels', 'depart', 'done'])(
    'opens the application at step %s and remembers it in the cookie',
    async (step) => {
      expect(await decideRoute(input('/agenda'), profile(step))).toEqual({
        kind: 'pass',
        cacheStep: step,
      });
    },
  );

  it('does not read the profile again when a valid ticket carries the step', async () => {
    const loader = profile('profil');
    expect(await decideRoute(input('/agenda', { cachedStep: 'rappels' }), loader)).toEqual({
      kind: 'pass',
    });
    expect(loader).not.toHaveBeenCalled();
  });

  it('redirects a cached step that has not crossed the IA step', async () => {
    const loader = profile('done');
    expect(await decideRoute(input('/agenda', { cachedStep: 'ia' }), loader)).toEqual({
      kind: 'redirect',
      to: '/premiers-pas/ia',
    });
    expect(loader).not.toHaveBeenCalled();
  });
});
