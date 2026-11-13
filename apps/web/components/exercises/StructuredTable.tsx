'use client';

import { evaluateTableChecks, formatFrenchNumber } from '@learny/bricks';
import type { ExerciseSubmission, ExerciseTableProduction } from '@learny/contracts';
import { Select, TextField, cn } from '@learny/ui';

import { fr } from '../../messages/fr';

import type { ProductionIssue } from './issue';

const t = fr.exercises;

type TableSubmission = Extract<ExerciseSubmission, { kind: 'table' }>;

export interface StructuredTableProps {
  production: ExerciseTableProduction;
  value: TableSubmission;
  locked?: boolean;
  issues: readonly ProductionIssue[];
  onChange: (value: TableSubmission) => void;
}

function cellId(row: number, key: string): string {
  return `exercise-cell-${String(row)}-${key}`;
}

function issueFor(issues: readonly ProductionIssue[], path: string): string | undefined {
  return issues.find((issue) => issue.path === path)?.message;
}

/**
 * Typed production table of SCR-08 (EF-1, CL-4). The live totals come from the pure
 * `evaluateTableChecks` of SPEC-503/502: a wrongly typed cell is annotated and the submission stays
 * blocked, and the declared `sum_equal` control is displayed without any model call.
 */
export function StructuredTable({
  production,
  value,
  locked = false,
  issues,
  onChange,
}: StructuredTableProps) {
  const rows: Array<Record<string, string>> =
    value.rows.length > 0 ? value.rows : Array.from({ length: production.initialRows }, () => ({}));
  const results = evaluateTableChecks(production, { fields: value.fields, rows });
  const derivedColumnLabel =
    production.checks.find((check) => check.sideColumnLabel !== undefined)?.sideColumnLabel ?? null;
  const hasDerivedColumn =
    derivedColumnLabel !== null &&
    !production.columns.some((column) => column.label === derivedColumnLabel);

  function updateCell(rowIndex: number, key: string, cellValue: string) {
    const next = rows.map((row, index) =>
      index === rowIndex ? { ...row, [key]: cellValue } : row,
    );
    onChange({ ...value, rows: next });
  }

  function removeRow(index: number) {
    onChange({ ...value, rows: rows.filter((_, rowIndex) => rowIndex !== index) });
  }

  const columns = [
    '52px',
    ...production.columns.map(() => 'minmax(140px, 1.2fr)'),
    ...(hasDerivedColumn ? ['64px'] : []),
    '40px',
  ].join(' ');

  return (
    <div className="flex flex-col gap-12">
      <div
        aria-label={t.tableLabel}
        className="w-full max-w-full"
        style={{ overflowX: 'auto', maxWidth: '100%', contain: 'paint' }}
        data-testid="exercise-table"
        role="region"
        tabIndex={0}
      >
        <div
          className="flex min-w-680 flex-col gap-6 text-14"
          role="table"
          style={{ minWidth: '680px' }}
        >
          <div
            className="grid items-center gap-8 text-12 font-600 text-ink-muted"
            role="row"
            style={{ display: 'grid', gridTemplateColumns: columns }}
          >
            <span role="columnheader">{t.row}</span>
            {production.columns.map((column) => (
              <span key={column.key} role="columnheader">
                {column.label}
              </span>
            ))}
            {hasDerivedColumn ? <span role="columnheader">{derivedColumnLabel}</span> : null}
            <span role="columnheader">
              <span className="sr-only">Retirer</span>
            </span>
          </div>
          {rows.map((row, rowIndex) => (
            <div
              className="items-center gap-8"
              data-testid={`exercise-row-${String(rowIndex)}`}
              key={`row-${String(rowIndex)}`}
              role="row"
              style={{ display: 'grid', gridTemplateColumns: columns }}
            >
              <span className="font-700 tabular-nums" role="cell">
                {String(rowIndex + 1)}
              </span>
              {production.columns.map((column) => {
                const path = `rows.${String(rowIndex)}.${column.key}`;
                const error = issueFor(issues, path);
                const label = `${column.label} du poste ${String(rowIndex + 1)}`;
                return (
                  <div key={column.key} role="cell">
                    {column.type === 'select' ? (
                      <Select
                        aria-invalid={error === undefined ? undefined : true}
                        data-testid={cellId(rowIndex, column.key)}
                        disabled={locked}
                        error={error}
                        hideLabel
                        id={cellId(rowIndex, column.key)}
                        label={label}
                        onChange={(event) => {
                          updateCell(rowIndex, column.key, event.currentTarget.value);
                        }}
                        options={[
                          { value: '', label: t.choose },
                          ...(column.options ?? []).map((option) => ({
                            value: option.value,
                            label: option.label,
                          })),
                        ]}
                        value={row[column.key] ?? ''}
                      />
                    ) : (
                      <TextField
                        align={column.type === 'number' ? 'right' : 'left'}
                        data-testid={cellId(rowIndex, column.key)}
                        disabled={locked}
                        error={error}
                        hideLabel
                        id={cellId(rowIndex, column.key)}
                        inputMode={column.type === 'number' ? 'decimal' : undefined}
                        label={label}
                        onChange={(event) => {
                          updateCell(rowIndex, column.key, event.currentTarget.value);
                        }}
                        value={row[column.key] ?? ''}
                      />
                    )}
                  </div>
                );
              })}
              {hasDerivedColumn ? (
                <div
                  className={cn(
                    'text-13 font-700',
                    results[0]?.sideByRow[rowIndex] === 'Débit'
                      ? 'text-indigo-ink-strong'
                      : results[0]?.sideByRow[rowIndex] === 'Crédit'
                        ? 'text-green-ink'
                        : 'text-ink-muted',
                  )}
                  role="cell"
                >
                  {results[0]?.sideByRow[rowIndex] ?? '—'}
                </div>
              ) : null}
              <div role="cell">
                {rows.length > production.minRows && !locked ? (
                  <button
                    aria-label={`${t.removeRow} ${String(rowIndex + 1)}`}
                    className="inline-flex size-36 cursor-pointer items-center justify-center rounded-10 border-0 bg-canvas text-18 text-ink-muted"
                    data-testid={`exercise-remove-row-${String(rowIndex)}`}
                    onClick={() => {
                      removeRow(rowIndex);
                    }}
                    type="button"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-12">
        {!locked && rows.length < production.maxRows ? (
          <button
            className="min-h-38 cursor-pointer rounded-10 border border-dashed border-border-dotted bg-surface px-14 text-13 font-600 text-ink"
            data-testid="exercise-add-row"
            onClick={() => {
              onChange({ ...value, rows: [...rows, {}] });
            }}
            type="button"
          >
            {`+ ${t.addRow}`}
          </button>
        ) : (
          <span />
        )}
        <div
          aria-live="polite"
          className="ml-auto flex flex-wrap items-center gap-8 text-14 tabular-nums"
        >
          {results.map((result) => (
            <span className="flex flex-wrap items-center gap-8" key={result.index}>
              <span>
                {t.debit} <strong>{`${formatFrenchNumber(result.leftSum)} €`}</strong>
              </span>
              <span>
                {t.credit} <strong>{`${formatFrenchNumber(result.rightSum)} €`}</strong>
              </span>
              <span
                className={cn(
                  'rounded-full px-10 py-4 text-13 font-700',
                  result.state === 'empty'
                    ? 'bg-canvas text-ink-muted'
                    : result.state === 'balanced'
                      ? 'bg-green-soft text-green-ink'
                      : 'bg-orange-soft text-orange-ink',
                )}
                data-state={result.state}
                data-testid="exercise-table-state"
              >
                {result.label}
              </span>
            </span>
          ))}
        </div>
      </div>
      {issueFor(issues, 'rows') === undefined ? null : (
        <p className="m-0 text-13 font-600 text-orange-ink" role="alert">
          {issueFor(issues, 'rows')}
        </p>
      )}
    </div>
  );
}
