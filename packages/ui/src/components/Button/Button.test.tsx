// @vitest-environment jsdom
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { Button } from './Button';

afterEach(cleanup);

describe('[SPEC-302] Button', () => {
  it('applique les classes des six variantes (EF-1)', () => {
    const cases = [
      ['lime', ['bg-lime', 'text-ink', 'font-700']],
      ['dark', ['bg-ink', 'text-white', 'font-700']],
      ['outline', ['bg-surface', 'border-border-strong', 'text-ink', 'font-600']],
      ['ghost', ['bg-transparent', 'text-ink-muted', 'font-600']],
      ['danger', ['bg-transparent', 'text-danger', 'font-600']],
      ['outline-on-dark', ['border-dark-500', 'text-white', 'font-600']],
    ] as const;

    for (const [variant, classes] of cases) {
      const { unmount } = renderComponent(<Button variant={variant}>Continuer</Button>);
      const button = document.querySelector('button');
      expect(button, variant).not.toBeNull();
      for (const className of classes) expect(button?.className, variant).toContain(className);
      unmount();
    }
  });

  it('applique les quatre tailles (EF-1)', () => {
    const cases = [
      ['sm', ['min-h-40', 'px-14', 'rounded-10', 'text-13']],
      ['md', ['min-h-44', 'px-16', 'rounded-12', 'text-14']],
      ['lg', ['min-h-48', 'px-20', 'rounded-14', 'text-15']],
      ['xl', ['min-h-50', 'px-20', 'rounded-14', 'text-15']],
    ] as const;

    for (const [size, classes] of cases) {
      const { unmount } = renderComponent(<Button size={size}>Continuer</Button>);
      const button = document.querySelector('button');
      for (const className of classes) expect(button?.className, size).toContain(className);
      unmount();
    }
  });

  it('vaut type="button" par défaut et transmet les attributs natifs', () => {
    renderComponent(
      <Button aria-label="Enregistrer" data-testid="bouton" disabled>
        Enregistrer
      </Button>,
    );
    const button = document.querySelector('button');
    expect(button?.getAttribute('type')).toBe('button');
    expect(button?.getAttribute('aria-label')).toBe('Enregistrer');
    expect(button?.getAttribute('data-testid')).toBe('bouton');
    expect(button?.disabled).toBe(true);
  });

  it('loading désactive le bouton, pose aria-busy et conserve le libellé', () => {
    renderComponent(<Button loading>Continuer</Button>);
    const button = document.querySelector('button');
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute('aria-busy')).toBe('true');
    expect(button?.textContent).toContain('Continuer');
    expect(button?.textContent).toContain('Chargement…');
  });

  it('asChild rend le lien fourni avec les classes du bouton', () => {
    renderComponent(
      <Button asChild variant="lime">
        <a href="/_dev/ui">Ouvrir</a>
      </Button>,
    );
    const link = document.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/_dev/ui');
    expect(link?.className).toContain('bg-lime');
    expect(document.querySelector('button')).toBeNull();
  });

  it('fullWidth occupe toute la largeur', () => {
    renderComponent(<Button fullWidth>Continuer</Button>);
    expect(document.querySelector('button')?.className).toContain('w-full');
  });
});
