import { describe, expect, it } from 'vitest';

import { evaluateTableChecks, parseFrenchNumber, type TableProduction } from './table-checks';

const production: TableProduction = {
  kind: 'table',
  fields: [{ key: 'libelle', label: 'Libellé', type: 'text' }],
  columns: [
    {
      key: 'sens',
      label: 'Sens',
      type: 'select',
      options: [
        { value: 'Débit', label: 'Débit' },
        { value: 'Crédit', label: 'Crédit' },
      ],
    },
    { key: 'montant', label: 'Montant', type: 'number' },
  ],
  minRows: 1,
  maxRows: 5,
  initialRows: 2,
  checks: [
    {
      type: 'sum_equal',
      numberColumn: 'montant',
      groupColumn: 'sens',
      left: ['Débit'],
      right: ['Crédit'],
      leftLabel: 'Débit',
      rightLabel: 'Crédit',
      sideColumnLabel: 'Sens',
    },
  ],
};

function values(rows: Array<Record<string, string>>) {
  return { fields: { libelle: 'Pièce' }, rows };
}

describe('[SPEC-502] contrôle en direct du tableau', () => {
  const numbers: Array<[string, number | null]> = [
    ['1 234,56', 1234.56],
    ['1\u00A0234,56', 1234.56],
    ['1234.56', 1234.56],
    ['120', 120],
    ['-3,5', -3.5],
    ['+7', 7],
    ['0', 0],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['12,345', 12.345],
    ['abc', null],
    ['', null],
    ['   ', null],
    ['1,2,3', null],
    ['1.2.3', null],
    ['12 €', null],
  ];

  it.each(numbers)('parseFrenchNumber(%j) = %j', (raw, expected) => {
    expect(parseFrenchNumber(raw)).toBe(expected);
  });

  it('affiche « Pas encore de montant » sans ligne chiffrée (CA-4)', () => {
    for (const rows of [
      [],
      [{ sens: 'Débit', montant: '' }],
      [{ sens: 'Débit', montant: 'abc' }],
      [{ sens: 'Débit', montant: '0' }],
      [{ sens: 'Inconnu', montant: '120' }],
    ]) {
      const [check] = evaluateTableChecks(production, values(rows));
      expect(check?.state).toBe('empty');
      expect(check?.label).toBe('Pas encore de montant');
      expect(check?.leftSum).toBe(0);
      expect(check?.rightSum).toBe(0);
    }
  });

  it('affiche « ✓ Pièce équilibrée » à 120 € de chaque côté (CA-4)', () => {
    const [check] = evaluateTableChecks(
      production,
      values([
        { sens: 'Débit', montant: '120' },
        { sens: 'Crédit', montant: '120' },
      ]),
    );
    expect(check).toMatchObject({
      index: 0,
      leftSum: 120,
      rightSum: 120,
      difference: 0,
      state: 'balanced',
      label: '✓ Pièce équilibrée',
      sideByRow: ['Débit', 'Crédit'],
    });
  });

  it('affiche l’écart au centime avec le format français (CA-4)', () => {
    const [check] = evaluateTableChecks(
      production,
      values([
        { sens: 'Débit', montant: '120' },
        { sens: 'Crédit', montant: '100' },
      ]),
    );
    expect(check).toMatchObject({
      state: 'unbalanced',
      difference: 20,
      label: 'Écart : 20 €',
    });
  });

  it('arrondit chaque montant au centime (CL-7)', () => {
    const [check] = evaluateTableChecks(
      production,
      values([
        { sens: 'Débit', montant: '12,345' },
        { sens: 'Crédit', montant: '12,35' },
      ]),
    );
    expect(check?.leftSum).toBe(12.35);
    expect(check?.state).toBe('balanced');
  });

  it('totalise plusieurs lignes par côté', () => {
    const [check] = evaluateTableChecks(
      production,
      values([
        { sens: 'Débit', montant: '100' },
        { sens: 'Débit', montant: '20,50' },
        { sens: 'Crédit', montant: '120,50' },
      ]),
    );
    expect(check).toMatchObject({ leftSum: 120.5, rightSum: 120.5, state: 'balanced' });
  });

  it('rend un libellé de sens nul quand le contrôle n’en déclare pas', () => {
    const withoutLabels: TableProduction = {
      ...production,
      checks: [
        {
          type: 'sum_equal',
          numberColumn: 'montant',
          groupColumn: 'sens',
          left: ['Débit'],
          right: ['Crédit'],
        },
      ],
    };
    const [check] = evaluateTableChecks(
      withoutLabels,
      values([
        { sens: 'Débit', montant: '120' },
        { sens: 'Crédit', montant: '120' },
      ]),
    );
    expect(check?.sideByRow).toEqual([null, null]);
  });

  it('évalue chaque contrôle avec son index', () => {
    const twoChecks: TableProduction = {
      ...production,
      checks: [
        ...production.checks,
        {
          type: 'sum_equal',
          numberColumn: 'montant',
          groupColumn: 'sens',
          left: ['Débit'],
          right: ['Crédit'],
        },
      ],
    };
    const checks = evaluateTableChecks(
      twoChecks,
      values([
        { sens: 'Débit', montant: '120' },
        { sens: 'Crédit', montant: '120' },
      ]),
    );
    expect(checks.map((check) => check.index)).toEqual([0, 1]);
  });
});
