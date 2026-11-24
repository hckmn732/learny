// Integration tests of the three public legal pages (SPEC-806 §12; CA-1, CL-1).
//
// The real Server Components are rendered to static HTML: the response contains the table of
// contents, the stable anchors and the four footer links, and the proxy passes every anonymous
// request without a redirect. No session or database row is created by reading these pages.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LEGAL_IDENTITY, legalConfig } from '@learny/config';

import CguPage from '../../app/legal/cgu/page';
import ConfidentialitePage from '../../app/legal/confidentialite/page';
import MentionsPage from '../../app/legal/mentions/page';
import { LegalPage } from '../../components/legal/LegalPage';
import { decideRoute } from '../../lib/route-guard';
import { SITE_FOOTER_LINKS } from '../../lib/site-footer-links';

const PAGES = [
  {
    path: '/legal/cgu',
    render: CguPage,
    anchors: [
      'objet',
      'compte',
      'usage',
      'propriete',
      'donnees',
      'responsabilite',
      'resiliation',
      'modification',
      'droit',
    ],
    title: 'Conditions générales d’utilisation',
  },
  {
    path: '/legal/confidentialite',
    render: ConfidentialitePage,
    anchors: [
      'responsable',
      'donnees',
      'finalites',
      'durees',
      'droits',
      'destinataires',
      'cookies',
      'securite',
      'modifications',
    ],
    title: 'Politique de confidentialité',
  },
  {
    path: '/legal/mentions',
    render: MentionsPage,
    anchors: [
      'editeur',
      'hebergement',
      'propriete',
      'donnees',
      'responsabilite',
      'accessibilite',
      'contact',
    ],
    title: 'Mentions légales',
  },
] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('[SPEC-806] legal routes', () => {
  it('CA-1 — les trois pages répondent sans redirection à un visiteur non connecté', async () => {
    for (const page of PAGES) {
      const decision = await decideRoute({ pathname: page.path, search: '', userId: null }, () =>
        Promise.reject(new Error('profil non lu')),
      );
      expect(decision, page.path).toEqual({ kind: 'pass' });
    }
    expect(
      await decideRoute(
        {
          pathname: '/accessibilite',
          search: '',
          userId: null,
        },
        () => Promise.reject(new Error('profil non lu')),
      ),
    ).toEqual({ kind: 'pass' });
  });

  it('CA-1 — chaque page affiche titre, version, sommaire ancré, sections et pied dans l’ordre', () => {
    for (const page of PAGES) {
      const html = renderToStaticMarkup(createElement(page.render));
      expect(html, page.path).toContain(`data-testid="legal-title"`);
      expect(html, page.path).toContain(page.title);
      expect(html, page.path).toContain('data-testid="legal-version"');
      expect(html, page.path).toContain('Version');
      expect(html, page.path).toContain('En vigueur le');
      expect(html, page.path).toContain('data-testid="legal-toc"');
      expect(html, page.path).toContain('data-testid="legal-content"');
      for (const anchor of page.anchors) {
        expect(html, `${page.path} ancre ${anchor}`).toContain(`href="#${anchor}"`);
        expect(html, `${page.path} cible ${anchor}`).toContain(`id="${anchor}"`);
      }
      expect(html, page.path).toContain('data-testid="site-footer"');
      const footer = html.slice(html.indexOf('data-testid="site-footer"'));
      const positions = SITE_FOOTER_LINKS.map((link) => footer.indexOf(`href="${link.href}"`));
      expect(
        positions.every((position) => position > 0),
        page.path,
      ).toBe(true);
      expect(positions, page.path).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it('CA-1, CA-4 — une identité absente reste visible et annoncée, jamais inventée', () => {
    const html = renderToStaticMarkup(createElement(CguPage));
    expect(html).toContain('[à compléter]');
    expect(html).toContain('data-testid="legal-placeholder-notice"');
  });

  it('CA-1, ET-2 — une valeur hostile reste du texte assaini, jamais du HTML brut', () => {
    // ADR-4007: the identity is a code constant, injected here as the page would receive it.
    const config = legalConfig({ ...LEGAL_IDENTITY, entityName: '<img src=x onerror=alert(1)>' });
    const html = renderToStaticMarkup(createElement(LegalPage, { document: 'mentions', config }));
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror=');
  });
});
