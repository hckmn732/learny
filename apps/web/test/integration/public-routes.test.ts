import { describe, expect, it } from 'vitest';

import * as accessibilitePage from '../../app/accessibilite/page';
import { renderAccessibilityDeclaration } from '../../lib/accessibility-declaration';
import { decideRoute, type GuardInput } from '../../lib/route-guard';

const ANONYMOUS = '00000000-0000-4000-8000-000000000000';

function input(pathname: string, userId: string | null = null): GuardInput {
  return { pathname, search: '', userId, cachedStep: undefined };
}

const profile = () =>
  Promise.resolve({ onboardingStep: 'done', deletionScheduledFor: null } as const);

describe('[SPEC-803] route publique de déclaration d’accessibilité', () => {
  it('laisse un visiteur sans cookie atteindre /accessibilite (CA-7)', async () => {
    expect(await decideRoute(input('/accessibilite'), profile)).toEqual({ kind: 'pass' });
    expect(await decideRoute(input('/accessibilite', ANONYMOUS), profile)).toEqual({
      kind: 'pass',
    });
  });

  it('ne redirige jamais vers /connexion', async () => {
    const decision = await decideRoute(input('/accessibilite'), profile);
    expect(decision.kind).not.toBe('redirect');
  });

  it('expose une page rendue et ses métadonnées', () => {
    expect(typeof accessibilitePage.default).toBe('function');
    expect(accessibilitePage.metadata.title).toBe('Déclaration d’accessibilité · Learny');
    expect(renderAccessibilityDeclaration()).toContain('partiellement conforme');
  });
});
