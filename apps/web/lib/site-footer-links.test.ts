// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { cleanup, renderComponent, screen } from '@learny/testing/render';

import { SiteFooter } from '../components/site-footer/SiteFooter';

import { SITE_FOOTER_LINKS, SITE_FOOTER_NAV_LABEL } from './site-footer-links';

afterEach(() => {
  cleanup();
});

describe('[SPEC-806] site footer', () => {
  it('CA-1 — le registre suit l’ordre unique d’ADR-0204', () => {
    expect(SITE_FOOTER_LINKS.map((link) => link.href)).toEqual([
      '/legal/cgu',
      '/legal/confidentialite',
      '/legal/mentions',
      '/accessibilite',
    ]);
    expect(SITE_FOOTER_LINKS.map((link) => link.label)).toEqual([
      'CGU',
      'Confidentialité',
      'Mentions légales',
      'Accessibilité : partiellement conforme',
    ]);
    expect(new Set(SITE_FOOTER_LINKS.map((link) => link.href)).size).toBe(4);
  });

  it('CA-1 — le pied rend un footer et un nav nommé avec les quatre liens dans l’ordre', () => {
    renderComponent(createElement(SiteFooter));
    const footer = screen.getByTestId('site-footer');
    expect(footer.tagName).toBe('FOOTER');
    const nav = screen.getByRole('navigation', { name: SITE_FOOTER_NAV_LABEL });
    expect(nav.parentElement).toBe(footer);
    const links = screen.getAllByRole('link');
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
});
