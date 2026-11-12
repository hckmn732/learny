// @vitest-environment jsdom
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { Link } from './Link';

afterEach(cleanup);

describe('[SPEC-302] Link', () => {
  it('rend un lien interne sans target', () => {
    renderComponent(<Link href="/_dev/ui">Programme</Link>);
    const link = document.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/_dev/ui');
    expect(link?.getAttribute('target')).toBeNull();
    expect(link?.className).toContain('text-indigo-ink');
  });

  it('ouvre un lien externe dans un nouvel onglet et l’annonce', () => {
    renderComponent(<Link href="https://learny.example">Documentation</Link>);
    const link = document.querySelector('a');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link?.textContent).toContain('(nouvel onglet)');
  });

  it('applique les variantes strong, poids et subtle', () => {
    const { unmount } = renderComponent(
      <Link href="/_dev/ui" variant="strong" weight="bold">
        Reprendre
      </Link>,
    );
    expect(document.querySelector('a')?.className).toContain('font-700');
    unmount();

    renderComponent(
      <Link href="/_dev/ui" variant="subtle">
        En savoir plus
      </Link>,
    );
    expect(document.querySelector('a')?.className).toContain('text-ink-muted');
  });
});
