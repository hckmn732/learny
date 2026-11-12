import { describe, expect, it } from 'vitest';

import { buildFormationBreadcrumb } from './breadcrumb';

describe('[SPEC-303] buildFormationBreadcrumb', () => {
  it('produit Programme / Module n · titre / page (BR-NAV-04)', () => {
    expect(
      buildFormationBreadcrumb({
        formationId: 'f1',
        module: { id: 'm3', position: 3, title: 'Comptabilité générale' },
        page: 'Cours',
      }),
    ).toEqual([
      { label: 'Programme', href: '/formations/f1/programme' },
      {
        label: 'Module 3 · Comptabilité générale',
        href: '/formations/f1/modules/m3',
      },
      { label: 'Cours' },
    ]);
  });

  it('omet le module quand il est absent et accepte un dictionnaire injecté (ET-4)', () => {
    expect(
      buildFormationBreadcrumb(
        { formationId: 'f 1', page: 'Exercice' },
        { programme: 'Programme', module: (n, title) => `M${String(n)} ${title}` },
      ),
    ).toEqual([{ label: 'Programme', href: '/formations/f%201/programme' }, { label: 'Exercice' }]);
    expect(
      buildFormationBreadcrumb(
        { formationId: 'f1', module: { id: 'm2', position: 2, title: 'TVA' }, page: 'Quiz' },
        { programme: 'Parcours', module: (n, title) => `Leçon ${String(n)} : ${title}` },
      ),
    ).toEqual([
      { label: 'Parcours', href: '/formations/f1/programme' },
      { label: 'Leçon 2 : TVA', href: '/formations/f1/modules/m2' },
      { label: 'Quiz' },
    ]);
  });
});
