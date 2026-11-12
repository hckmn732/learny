// @vitest-environment jsdom
// The specification names this unit test `focus-return.test.ts`; JSX is therefore written with
// `createElement` so that the file stays a plain TypeScript module.
import { cleanup, screen, waitFor } from '@testing-library/react';
import { X } from 'lucide-react';
import { Fragment, createElement as h } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { IconButton } from '../components/IconButton';
import { TextField } from '../components/TextField';

import {
  AA_NORMAL_TEXT,
  ACCESSIBLE_TOKEN_PAIRS,
  contrastRatio,
  pairContrast,
  relativeLuminance,
} from './contrast';
import {
  findMainContent,
  findPageTitle,
  focusElement,
  focusMainContent,
  resolveFocusTarget,
  returnFocus,
} from './focus-return';
import { LiveRegion, shouldAnnounce } from './live-region';
import { SkipLink } from './skip-link';

afterEach(cleanup);

function SkipHarness() {
  return h(
    Fragment,
    null,
    h(SkipLink, null, 'Aller au contenu'),
    h(
      'main',
      { id: 'contenu-principal' },
      h('h1', { 'data-page-title': '' }, 'Accueil'),
      h('a', { href: '#autre' }, 'Premier lien secondaire'),
      h('a', { href: '#autre-2' }, 'Deuxième lien secondaire'),
      h('p', null, 'Contenu principal'),
    ),
  );
}

describe('[SPEC-309] Socle d’accessibilité', () => {
  describe('lien d’évitement et navigation clavier (CA-1)', () => {
    it('rend le lien visible et déplace le focus sur main#contenu-principal', async () => {
      const { user } = renderComponent(h(SkipHarness));
      const link = screen.getByRole('link', { name: 'Aller au contenu' });
      expect(link.getAttribute('href')).toBe('#contenu-principal');

      await user.tab();
      expect(document.activeElement).toBe(link);
      expect(link.className).toContain('learny-skip-link');

      await user.keyboard('{Enter}');
      const main = screen.getByRole('main');
      expect(main.getAttribute('tabindex')).toBe('-1');
      expect(document.activeElement).toBe(main);
    });

    it('conserve un ordre de tabulation valide après le lien d’évitement', async () => {
      const { user } = renderComponent(h(SkipHarness));
      await user.tab();
      expect(screen.getByRole('link', { name: 'Aller au contenu' })).toBe(document.activeElement);
      await user.tab();
      expect(screen.getByRole('link', { name: 'Premier lien secondaire' })).toBe(
        document.activeElement,
      );
      await user.tab();
      expect(screen.getByRole('link', { name: 'Deuxième lien secondaire' })).toBe(
        document.activeElement,
      );
    });
  });

  describe('retour du focus des panneaux (CA-2, CL-1)', () => {
    it('rend le focus au déclencheur encore connecté', () => {
      renderComponent(
        h(
          Fragment,
          null,
          h('button', { type: 'button' }, 'Ouvrir le panneau'),
          h('h1', { 'data-page-title': '' }, 'Titre de la page'),
        ),
      );
      const trigger = screen.getByRole('button', { name: 'Ouvrir le panneau' });
      trigger.focus();

      expect(returnFocus({ trigger })).toBe(true);
      expect(document.activeElement).toBe(trigger);
    });

    it('utilise le titre de la page quand le déclencheur a été supprimé', () => {
      renderComponent(h('h1', { 'data-page-title': '' }, 'Titre de la page'));
      const trigger = document.createElement('button');
      document.body.append(trigger);
      trigger.focus();
      trigger.remove();

      expect(returnFocus({ trigger })).toBe(true);
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
      expect(document.activeElement).not.toBe(document.body);
    });

    it('préfère le repli explicite puis le contenu principal sans jamais viser body', () => {
      renderComponent(
        h(
          Fragment,
          null,
          h('h1', null, 'Titre implicite'),
          h(
            'main',
            { id: 'contenu-principal' },
            h('button', { type: 'button', 'data-testid': 'fallback' }, 'Repli'),
          ),
        ),
      );
      const fallback = screen.getByTestId('fallback');
      const main = screen.getByRole('main');

      expect(findPageTitle(document)).toBe(screen.getByRole('heading', { level: 1 }));
      expect(findMainContent(document)).toBe(main);
      expect(resolveFocusTarget({ fallback })).toBe(fallback);
      expect(focusMainContent()).toBe(true);
      expect(document.activeElement).toBe(main);

      const emptyDocument = document.implementation.createHTMLDocument('empty');
      expect(resolveFocusTarget({ document: emptyDocument })).toBeNull();
      expect(focusElement(emptyDocument.body)).toBe(false);
    });

    it('refuse une cible déconnectée et signale l’échec', () => {
      renderComponent(h('h1', { 'data-page-title': '' }, 'Titre'));
      const detached = document.createElement('button');
      expect(returnFocus({ trigger: detached })).toBe(true);
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
      expect(focusElement(null)).toBe(false);
    });
  });

  describe('annonces aria-live (CA-2, CL-2)', () => {
    it('déduplique les messages consécutifs identiques', async () => {
      const { rerender } = renderComponent(
        h(LiveRegion, { 'data-testid': 'live', message: 'Résultat chargé' }),
      );
      const region = screen.getByTestId('live');
      expect(region.getAttribute('role')).toBe('status');
      expect(region.getAttribute('aria-live')).toBe('polite');
      expect(region.getAttribute('data-announcement-count')).toBe('1');

      rerender(h(LiveRegion, { 'data-testid': 'live', message: 'Résultat chargé' }));
      expect(region.getAttribute('data-announcement-count')).toBe('1');

      rerender(h(LiveRegion, { 'data-testid': 'live', message: 'Autre résultat' }));
      await waitFor(() => {
        expect(region.textContent).toBe('Autre résultat');
      });
      expect(region.getAttribute('data-announcement-count')).toBe('2');
    });

    it('réannonce le même message après un effacement et traite les erreurs assertivement', async () => {
      expect(shouldAnnounce(null, '')).toBe(false);
      expect(shouldAnnounce('', 'Résultat')).toBe(true);
      expect(shouldAnnounce('Résultat', 'Résultat')).toBe(false);

      const { rerender } = renderComponent(h(LiveRegion, { politeness: 'assertive', message: '' }));
      const region = screen.getByRole('alert');
      expect(region.getAttribute('aria-live')).toBe('assertive');
      rerender(h(LiveRegion, { politeness: 'assertive', message: 'Erreur prioritaire' }));
      await waitFor(() => {
        expect(region.textContent).toBe('Erreur prioritaire');
      });
      rerender(h(LiveRegion, { politeness: 'assertive', message: '' }));
      await waitFor(() => {
        expect(region.textContent).toBe('');
      });
      rerender(h(LiveRegion, { politeness: 'assertive', message: 'Erreur prioritaire' }));
      await waitFor(() => {
        expect(region.textContent).toBe('Erreur prioritaire');
      });
      expect(region.getAttribute('data-announcement-count')).toBe('2');
    });

    it('nomme chaque contrôle interactif', () => {
      renderComponent(
        h(
          Fragment,
          null,
          h(IconButton, { icon: X, label: 'Fermer le panneau' }),
          h(TextField, { label: 'Rechercher une notion' }),
        ),
      );
      expect(screen.getByRole('button', { name: 'Fermer le panneau' })).toBeTruthy();
      expect(screen.getByRole('textbox', { name: 'Rechercher une notion' })).toBeTruthy();
    });
  });

  describe('contrastes des jetons (CA-3)', () => {
    it('calcule les luminances et les ratios WCAG 2.2', () => {
      expect(relativeLuminance('#000000')).toBe(0);
      expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
      expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
      expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1);
    });

    it('respecte le seuil AA pour chaque paire de la galerie', () => {
      expect(ACCESSIBLE_TOKEN_PAIRS.length).toBeGreaterThanOrEqual(10);
      for (const pair of ACCESSIBLE_TOKEN_PAIRS) {
        expect(pair.minimum).toBe(AA_NORMAL_TEXT);
        expect(pairContrast(pair), pair.id).toBeGreaterThanOrEqual(pair.minimum);
      }
    });
  });
});
