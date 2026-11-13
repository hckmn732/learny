// Live checks of a table production (SPEC-502 ET-4, reused by SPEC-503 EF-10). Pure functions:
// the view calls them on every keystroke, no I/O and no clock.
import type { InstructionProduction } from './schema';

export type TableProduction = Extract<InstructionProduction, { kind: 'table' }>;

export interface TableResponse {
  rows: Array<Record<string, string>>;
}

export interface TableCheckResult {
  index: number;
  leftSum: number;
  rightSum: number;
  difference: number;
  state: 'empty' | 'balanced' | 'unbalanced';
  label: string;
  sideByRow: Array<string | null>;
}

const NUMBER_FORMAT = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** Parses "1 234,56", "1234.56", "120" and "-3,5"; returns null for anything else (ET-4). */
export function parseFrenchNumber(raw: string): number | null {
  const compact = raw.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (compact === '' || !/^-?\d+(?:\.\d+)?$/.test(compact)) return null;
  const value = Number(compact);
  return Number.isFinite(value) ? value : null;
}

function cents(value: number): number {
  return Math.round(value * 100);
}

function amountOf(raw: string | undefined): number {
  return raw === undefined ? 0 : (parseFrenchNumber(raw) ?? 0);
}

export function evaluateTableChecks(
  production: TableProduction,
  values: TableResponse,
): TableCheckResult[] {
  return production.checks.map((check, index) => {
    const groupOf = (row: Record<string, string>) => (row[check.groupColumn] ?? '').trim();
    const filled = values.rows.some((row) => {
      const group = groupOf(row);
      const amount = amountOf(row[check.numberColumn]);
      return (check.left.includes(group) || check.right.includes(group)) && amount > 0;
    });
    let left = 0;
    let right = 0;
    const sideByRow = values.rows.map((row) => {
      const group = groupOf(row);
      const amount = amountOf(row[check.numberColumn]);
      if (check.left.includes(group)) {
        left += amount;
        return check.leftLabel ?? null;
      }
      if (check.right.includes(group)) {
        right += amount;
        return check.rightLabel ?? null;
      }
      return null;
    });

    const leftSum = cents(left) / 100;
    const rightSum = cents(right) / 100;
    const difference = Math.round(cents(left) - cents(right)) / 100;
    const state: TableCheckResult['state'] = !filled
      ? 'empty'
      : difference === 0
        ? 'balanced'
        : 'unbalanced';
    const label =
      state === 'empty'
        ? 'Pas encore de montant'
        : state === 'balanced'
          ? '✓ Pièce équilibrée'
          : `Écart : ${NUMBER_FORMAT.format(Math.abs(difference))} €`;

    return { index, leftSum, rightSum, difference, state, label, sideByRow };
  });
}

/** French number used by the inline totals (EF-10). */
export function formatFrenchNumber(value: number): string {
  return NUMBER_FORMAT.format(value);
}
