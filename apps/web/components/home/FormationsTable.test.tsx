// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import type { OngoingFormationRow } from '@learny/contracts';
import { cleanup, renderComponent, screen } from '@learny/testing/render';

import { FormationsTable } from './home-view';

afterEach(cleanup);

const row = (overrides: Partial<OngoingFormationRow>): OngoingFormationRow => ({
  id: 'f1',
  monogram: 'SAP',
  accent: 'indigo',
  status: 'active',
  title: 'SAP S/4HANA Finance',
  subtitle: 'Être opérationnel · Certification',
  progressPercent: 29,
  modulePosition: 3,
  moduleCount: 7,
  moduleTitle: 'Comptabilité générale',
  moduleStatus: { label: 'Quiz à repasser', tone: 'orange' },
  nextActivity: { when: "Aujourd'hui, 14:00", detail: 'Quiz de validation' },
  endDate: '2026-12-11',
  action: { label: 'Reprendre', href: '/formations/f1/modules/m3' },
  primaryAction: true,
  ...overrides,
});

describe('[SPEC-603] tableau des formations', () => {
  it('conserve l’ordre des lignes et les libellés d’action (EF-6)', () => {
    renderComponent(
      <FormationsTable
        empty={<p>Aucune</p>}
        rows={[
          row({}),
          row({
            id: 'f2',
            monogram: 'AG',
            accent: 'green',
            title: 'Gestion de projet agile',
            subtitle: 'Dialoguer avec des experts',
            progressPercent: 83,
            modulePosition: 5,
            moduleCount: 6,
            moduleTitle: 'Rétrospectives',
            moduleStatus: { label: 'Apports en cours', tone: 'green' },
            nextActivity: { when: 'Demain, 17:30', detail: 'Apports, chapitre 2' },
            endDate: '2026-11-27',
            action: { label: 'Reprendre', href: '/formations/f2/modules/m5' },
            primaryAction: false,
          }),
          row({
            id: 'f3',
            monogram: 'PY',
            accent: 'orange',
            status: 'programme_proposed',
            title: "Python pour l'analyse de données",
            subtitle: 'Livrer un projet',
            progressPercent: 0,
            modulePosition: null,
            moduleCount: 8,
            moduleTitle: null,
            moduleStatus: null,
            nextActivity: { when: 'Valider le programme', detail: '8 modules proposés' },
            endDate: '2027-02-19',
            action: { label: 'Continuer', href: '/formations/f3/programme' },
            primaryAction: false,
          }),
        ]}
      />,
    );
    const rows = screen.getAllByTestId(/^home-formation-row-/);
    expect(rows.map((element: HTMLElement) => element.getAttribute('data-testid'))).toEqual([
      'home-formation-row-f1',
      'home-formation-row-f2',
      'home-formation-row-f3',
    ]);
    expect(screen.getByTestId('home-formation-action-f1').getAttribute('href')).toBe(
      '/formations/f1/modules/m3',
    );
    expect(screen.getByTestId('home-formation-action-f2').textContent).toContain('Reprendre');
    expect(screen.getByTestId('home-formation-action-f3').textContent).toContain('Continuer');
    expect(screen.getByText('Quiz à repasser')).toBeTruthy();
    expect(screen.getByText('Apports en cours')).toBeTruthy();
  });

  it('affiche un état vide sans tableau (EF-8)', () => {
    renderComponent(<FormationsTable empty={<p>Aucune formation en cours</p>} rows={[]} />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Aucune formation en cours')).toBeTruthy();
  });
});
