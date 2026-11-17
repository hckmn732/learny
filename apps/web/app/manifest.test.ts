import { describe, expect, it } from 'vitest';

import { colors } from '@learny/ui/tokens';

import manifest from './manifest';

describe('[SPEC-801] manifeste de l’application', () => {
  it('déclare exactement les champs de EF-1 (CA-1)', () => {
    const value = manifest();
    expect(value).toMatchObject({
      name: 'Learny',
      short_name: 'Learny',
      description: 'Apprenez intensément, retenez durablement.',
      lang: 'fr',
      dir: 'ltr',
      id: '/accueil',
      start_url: '/accueil?source=pwa',
      scope: '/',
      display: 'standalone',
      orientation: 'any',
      background_color: colors.canvas,
      theme_color: colors.ink,
      categories: ['education'],
    });
    expect(value.icons).toEqual([
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ]);
  });
});
