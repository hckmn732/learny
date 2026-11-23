// Vitest [SPEC-3102] — résolution des liens profonds internes (EF-8).
import { describe, expect, it } from 'vitest';

import { isAuthPath, parseQuery, resolveDeepLink, universalLinkHost } from './deep-links';

const WEB = 'https://app.learny.fr';

describe('[SPEC-3102] liens profonds internes et universels', () => {
  it('résout le schéma de l’application, avec ou sans barre (EF-8)', () => {
    expect(resolveDeepLink('learny://aujourdhui', WEB)).toEqual({ path: '/aujourdhui', query: '' });
    expect(resolveDeepLink('learny:///profil', WEB)).toEqual({ path: '/profil', query: '' });
    expect(resolveDeepLink('learny://agenda?vue=semaine', WEB)).toEqual({
      path: '/agenda',
      query: 'vue=semaine',
    });
    expect(resolveDeepLink('learny://', WEB)).toEqual({ path: '/', query: '' });
  });

  it('résout le lien universel du web (EF-8)', () => {
    expect(resolveDeepLink('https://app.learny.fr/reviser', WEB)).toEqual({
      path: '/reviser',
      query: '',
    });
    expect(resolveDeepLink('https://app.learny.fr/formations/abc?onglet=semaine', WEB)).toEqual({
      path: '/formations/abc',
      query: 'onglet=semaine',
    });
    expect(universalLinkHost(WEB)).toBe('app.learny.fr');
  });

  it('ignore tout ce qui ne mène pas à l’application (ADR-3002 § 3)', () => {
    expect(resolveDeepLink('https://evil.example/aujourdhui', WEB)).toBeNull();
    expect(resolveDeepLink('mailto:alex@exemple.fr', WEB)).toBeNull();
    expect(resolveDeepLink('   ', WEB)).toBeNull();
    expect(resolveDeepLink('https://app.learny.fr/x', '')).toBeNull();
  });

  it('reconnaît les routes d’authentification, laissées hors garde (SPEC-3101 EF-7)', () => {
    expect(isAuthPath('/auth/callback')).toBe(true);
    expect(isAuthPath('/connexion')).toBe(true);
    expect(isAuthPath('/aujourdhui')).toBe(false);
  });

  it('lit les paramètres du lien', () => {
    expect(parseQuery('demo=1&email=alex%40exemple.fr')).toEqual({
      demo: '1',
      email: 'alex@exemple.fr',
    });
    expect(parseQuery('')).toEqual({});
  });
});
