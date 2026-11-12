import { describe, expect, it } from 'vitest';

import { isSafeNextPath, onboardingDestination, resolvePostAuthDestination } from './destination';

const done = { onboardingStep: 'done', deletionScheduledFor: null };

describe('[SPEC-202] destination après authentification', () => {
  it.each([
    ['profil', '/premiers-pas/profil'],
    ['rythme', '/premiers-pas/rythme'],
    ['ia', '/premiers-pas/ia'],
  ])('sends an unfinished onboarding (%s) to %s, whatever `next` says (CL-5)', (step, expected) => {
    expect(resolvePostAuthDestination({ ...done, onboardingStep: step }, '/agenda')).toBe(expected);
  });

  it.each(['rappels', 'depart', 'done'])('lets step %s through to next or the home', (step) => {
    const profile = { ...done, onboardingStep: step };
    expect(resolvePostAuthDestination(profile)).toBe('/accueil');
    expect(resolvePostAuthDestination(profile, '/agenda?semaine=2')).toBe('/agenda?semaine=2');
  });

  it('sends an account scheduled for deletion to its profile, before anything else (CL-6)', () => {
    for (const step of ['profil', 'ia', 'done']) {
      expect(
        resolvePostAuthDestination(
          { onboardingStep: step, deletionScheduledFor: new Date('2026-12-01T00:00:00Z') },
          '/agenda',
        ),
      ).toBe('/parametres#profil');
    }
    expect(
      resolvePostAuthDestination({ ...done, deletionScheduledFor: '2026-12-01T00:00:00Z' }),
    ).toBe('/parametres#profil');
  });

  it.each([
    '//evil.example',
    'https://evil.example',
    'http://evil.example/accueil',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    'accueil',
    '',
    '/ok\nhttps://evil.example',
    '/ok\t//evil.example',
    `/${'a'.repeat(512)}`,
  ])('ignores the unsafe next %j (CL-4)', (next) => {
    expect(isSafeNextPath(next)).toBe(false);
    expect(resolvePostAuthDestination(done, next)).toBe('/accueil');
  });

  it.each(['/agenda', '/formations/abc?tab=notions#top', '/a'.padEnd(512, 'b')])(
    'accepts the relative path %j',
    (next) => {
      expect(isSafeNextPath(next)).toBe(true);
    },
  );

  it('maps only the blocking steps to the onboarding pages', () => {
    expect(onboardingDestination('rythme')).toBe('/premiers-pas/rythme');
    expect(onboardingDestination('rappels')).toBeNull();
    expect(onboardingDestination('inconnu')).toBeNull();
  });
});
