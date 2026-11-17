// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { cleanup, renderComponent, screen, within } from '@learny/testing/render';

import { SiteFooter } from './SiteFooter';

afterEach(cleanup);

describe('[SPEC-803] pied de page public', () => {
  it('rend les quatre liens dans l’ordre d’ADR-0204', () => {
    renderComponent(<SiteFooter />);
    const links = within(screen.getByTestId('site-footer-nav')).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'CGU',
      'Confidentialité',
      'Mentions légales',
      'Accessibilité : partiellement conforme',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/legal/cgu',
      '/legal/confidentialite',
      '/legal/mentions',
      '/accessibilite',
    ]);
  });

  it('expose un footer et un nav nommé « Informations légales »', () => {
    renderComponent(<SiteFooter />);
    expect(screen.getByRole('contentinfo')).toBeDefined();
    expect(screen.getByRole('navigation', { name: 'Informations légales' })).toBeDefined();
  });
});
