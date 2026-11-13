// Live `sum_equal` control of a structured table (SPEC-502 ET-4, ADR-0027, CA-4). Rows are counted
// on the left or right from their group value; amounts are compared at the cent, and the three
// labels are exactly those of the Exercice mockup.
import type { TableResponse } from './response';
import type { InstructionProduction } from './schema';

export type TableProduction = Extract<InstructionProduction, { kind: 'table' }>;

export type TableCheckState = 'empty' | 'balanced' | 'unbalanced';

export interface TableCheckResult {
  index: number;
  leftSum: number;
  rightSum: number;
  difference: number;
  state: TableCheckState;
  label: string;
  sideByRow: Array<string | null>;
}

const numberFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** Parses a French or plain decimal number; returns null for anything that is not a number. */
export function parseFrenchNumber(raw: string): number | null {
  const compact = raw.replace(/\s/gu, '');
  if (compact === '') return null;

  let normalized: string;
  if (compact.includes(',') && compact.includes('.')) {
    const decimal = compact.lastIndexOf(',') > compact.lastIndexOf('.') ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    normalized = compact.split(thousands).join('').replace(decimal, '.');
  } else if (compact.includes(',')) {
    if (compact.indexOf(',') !== compact.lastIndexOf(',')) return null;
    normalized = compact.replace(',', '.');
  } else {
    if (compact.indexOf('.') !== compact.lastIndexOf('.')) return null;
    normalized = compact;
  }
  if (!/^[+-]?\d+(\.\d+)?$/u.test(normalized)) return null;

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function toCents(raw: string | undefined): number {
  const value = parseFrenchNumber(raw ?? '');
  return value === null ? 0 : Math.round(value * 100);
}

function formatEuro(value: number): string {
  return `${numberFormat.format(value)} €`;
}

/** Evaluates every `sum_equal` check of a table production on the current values (CA-4). */
export function evaluateTableChecks(
  production: TableProduction,
  values: TableResponse,
): TableCheckResult[] {
  return production.checks.map((check, index) => {
    let leftCents = 0;
    let rightCents = 0;
    let hasAmount = false;
    const sideByRow: Array<string | null> = [];

    for (const row of values.rows) {
      const group = (row[check.groupColumn] ?? '').trim();
      const side = check.left.includes(group)
        ? 'left'
        : check.right.includes(group)
          ? 'right'
          : null;
      sideByRow.push(
        side === 'left'
          ? (check.leftLabel ?? null)
          : side === 'right'
            ? (check.rightLabel ?? null)
            : null,
      );

      const cents = toCents(row[check.numberColumn]);
      if (side === 'left') leftCents += cents;
      else if (side === 'right') rightCents += cents;
      if (side !== null && cents > 0) hasAmount = true;
    }

    const differenceCents = Math.abs(leftCents - rightCents);
    const state: TableCheckState = !hasAmount
      ? 'empty'
      : differenceCents === 0 && leftCents > 0
        ? 'balanced'
        : 'unbalanced';
    const label =
      state === 'empty'
        ? 'Pas encore de montant'
        : state === 'balanced'
          ? '✓ Pièce équilibrée'
          : `Écart : ${formatEuro(differenceCents / 100)}`;

    return {
      index,
      leftSum: leftCents / 100,
      rightSum: rightCents / 100,
      difference: differenceCents / 100,
      state,
      label,
      sideByRow,
    };
  });
}
