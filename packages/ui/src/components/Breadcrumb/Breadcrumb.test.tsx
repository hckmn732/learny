// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { Breadcrumb } from './Breadcrumb';

afterEach(cleanup);

describe('[SPEC-303] Breadcrumb', () => {
  it('affiche le motif de Cours.dc.html et aria-current sur la page (CA-1)', () => {
    renderComponent(
      <Breadcrumb
        data-testid="breadcrumb"
        items={[
          { label: 'Programme', href: '/formations/f1/programme' },
          {
            label: 'Module 3 · Comptabilité générale',
            href: '/formations/f1/modules/m3',
          },
          { label: 'Cours' },
        ]}
      />,
    );
    const nav = screen.getByTestId('breadcrumb');
    expect(nav.tagName).toBe('NAV');
    expect(nav.getAttribute('aria-label')).toBe("Fil d'Ariane");
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Programme',
      'Module 3 · Comptabilité générale',
    ]);
    expect(links[0]?.getAttribute('href')).toBe('/formations/f1/programme');
    expect(links[1]?.getAttribute('href')).toBe('/formations/f1/modules/m3');
    const current = nav.querySelector('[aria-current="page"]');
    expect(current?.textContent).toBe('Cours');
    expect(current?.className).toContain('text-ink-muted');
    expect(screen.getByRole('list')).toBeTruthy();
  });

  it('tronque les libellés de plus de 40 caractères et garde le titre complet (EF-15)', () => {
    const long = 'Un module au libellé particulièrement long qui dépasse quarante caractères';
    renderComponent(
      <Breadcrumb
        items={[
          { label: 'Programme', href: '/programme' },
          { label: long, href: '/module' },
          { label: 'Cours' },
        ]}
      />,
    );
    const link = screen.getByRole('link', { name: /Un module au libellé/ });
    expect(link.textContent.endsWith('…')).toBe(true);
    expect(link.textContent).toHaveLength(41);
    expect(link.getAttribute('title')).toBe(long);
  });
});
