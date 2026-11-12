// Internal rules of an instruction (ET-4): criteria total exactly 10 points, unique criterion keys,
// unique column keys, select options consistency and sum-check columns.
import { brickIssue, type BrickIssue } from '../../issues';
import { duplicateIds, pointsSum } from '../checks-helpers';

import type { InstructionColumn, InstructionPayload } from './schema';

function optionIssues(columns: readonly InstructionColumn[], base: string): BrickIssue[] {
  const issues: BrickIssue[] = [];
  columns.forEach((column, index) => {
    const path = `payload.production.${base}.${String(index)}`;
    if (column.type === 'select') {
      if (column.options === undefined || column.options.length === 0) {
        issues.push(
          brickIssue('TABLE_OPTIONS_INVALID', `${path}.options`, 'A select column needs options.'),
        );
      }
    } else if (column.options !== undefined) {
      issues.push(
        brickIssue(
          'TABLE_OPTIONS_INVALID',
          `${path}.options`,
          'Options are only allowed on a select column.',
        ),
      );
    }
    if (column.options !== undefined) {
      const values = new Set<string>();
      column.options.forEach((option, optionIndex) => {
        if (values.has(option.value)) {
          issues.push(
            brickIssue(
              'TABLE_OPTIONS_INVALID',
              `${path}.options.${String(optionIndex)}.value`,
              `Duplicate option value "${option.value}".`,
            ),
          );
        }
        values.add(option.value);
      });
    }
  });
  return issues;
}

export function instructionChecks(payload: InstructionPayload): BrickIssue[] {
  const issues: BrickIssue[] = [];
  const sum = pointsSum(payload.criteria);
  if (sum !== 10) {
    issues.push(
      brickIssue(
        'CRITERIA_POINTS_MISMATCH',
        'payload.criteria',
        `Instruction criteria must total exactly 10 points (found ${String(sum)}).`,
      ),
    );
  }
  issues.push(
    ...duplicateIds(
      payload.criteria.map((criterion, index) => ({
        id: criterion.key,
        path: `payload.criteria.${String(index)}.key`,
      })),
    ),
  );

  if (payload.production.kind !== 'table') return issues;
  const table = payload.production;

  issues.push(
    ...duplicateIds([
      ...table.fields.map((column, index) => ({
        id: column.key,
        path: `payload.production.fields.${String(index)}.key`,
      })),
      ...table.columns.map((column, index) => ({
        id: column.key,
        path: `payload.production.columns.${String(index)}.key`,
      })),
    ]),
  );

  issues.push(...optionIssues(table.fields, 'fields'));
  issues.push(...optionIssues(table.columns, 'columns'));

  const columns = new Map(table.columns.map((column) => [column.key, column]));
  table.checks.forEach((check, index) => {
    const number = columns.get(check.numberColumn);
    if (number === undefined || number.type !== 'number') {
      issues.push(
        brickIssue(
          'TABLE_CHECK_COLUMN_UNKNOWN',
          `payload.production.checks.${String(index)}.numberColumn`,
          `Unknown number column "${check.numberColumn}" (a number column is required).`,
        ),
      );
    }
    if (!columns.has(check.groupColumn)) {
      issues.push(
        brickIssue(
          'TABLE_CHECK_COLUMN_UNKNOWN',
          `payload.production.checks.${String(index)}.groupColumn`,
          `Unknown group column "${check.groupColumn}".`,
        ),
      );
    }
  });

  return issues;
}
