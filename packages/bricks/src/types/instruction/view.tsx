'use client';

import { useId } from 'react';

import { Badge, Button, Select, TextField, Textarea, cn } from '@learny/ui';

import { resolveLabels } from '../../view/labels';
import { MarkdownContent } from '../../view/markdown';
import type { BrickViewProps, InstructionResponse } from '../../view-types';

import { evaluateTableChecks, formatFrenchNumber } from './table-checks';

function blankRows(count: number): Record<string, string>[] {
  return Array.from({ length: count }, () => ({}));
}

/** Practical instruction: dark brief, structured table, live totals and tutor review (EF-10). */
export function InstructionView(props: BrickViewProps<'instruction'>) {
  const {
    brick,
    variant,
    value,
    onChange,
    status,
    correction,
    hints,
    hintsUsed = 0,
    onHintRequest,
    onFileSelect,
    labels,
  } = props;
  const t = resolveLabels(labels);
  const generatedId = useId();
  const payload = brick.publicPayload;
  const locked = status === 'locked' || status === 'corrected' || variant === 'review';
  const corrected = status === 'corrected' || variant === 'review';
  const review = correction?.kind === 'instruction' ? correction : null;
  const production = payload.production;
  const current: InstructionResponse = value ?? { fields: {}, rows: [] };
  const fields = current.fields;
  const rows =
    production.kind === 'table'
      ? current.rows.length > 0
        ? current.rows
        : blankRows(production.initialRows)
      : [];

  function updateResponse(patch: Partial<InstructionResponse>) {
    if (locked || !onChange) return;
    onChange({
      fields,
      rows,
      ...(current.text === undefined ? {} : { text: current.text }),
      ...(current.resourceId === undefined ? {} : { resourceId: current.resourceId }),
      ...(current.url === undefined ? {} : { url: current.url }),
      ...(current.explanation === undefined ? {} : { explanation: current.explanation }),
      ...patch,
    });
  }

  const table = production.kind === 'table' ? production : null;
  const checkResults = table
    ? evaluateTableChecks(table, { rows: current.rows.length > 0 ? current.rows : rows })
    : [];
  const derivedColumnLabel =
    table?.checks.find((check) => check.sideColumnLabel !== undefined)?.sideColumnLabel ?? null;
  const hasDerivedColumn =
    derivedColumnLabel !== null &&
    !table?.columns.some((column) => column.label === derivedColumnLabel);

  return (
    <section className="flex flex-col gap-18 text-ink" data-testid="brick-instruction">
      <section
        aria-labelledby={`${generatedId}-consigne`}
        className="flex flex-col gap-12 rounded-24 bg-ink px-26 py-24 text-white"
        data-testid="brick-instruction-brief"
      >
        <h2
          className="m-0 text-12 font-700 tracking-kicker text-lime uppercase"
          id={`${generatedId}-consigne`}
        >
          {t.instructionConsigne}
        </h2>
        <div className="[&_a]:text-lime [&_code]:bg-dark-800 [&_code]:text-white [&_p]:text-white [&_strong]:text-white">
          <MarkdownContent markdown={payload.taskMd} />
        </div>
        {payload.data.length > 0 ? (
          <ul className="m-0 flex list-none flex-wrap gap-8 p-0 text-13 text-on-dark-secondary">
            {payload.data.map((entry) => (
              <li className="rounded-10 bg-dark-800 px-10 py-6" key={entry}>
                {entry}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section
        aria-labelledby={`${generatedId}-saisie`}
        className="flex flex-col gap-16 rounded-24 border border-solid border-border bg-surface px-24 py-22"
        data-testid="brick-instruction-entry"
      >
        <h2 className="m-0 text-18 font-600" id={`${generatedId}-saisie`}>
          {t.instructionEntry}
        </h2>

        {table ? (
          <>
            {table.fields.length > 0 ? (
              <div className="flex flex-wrap gap-14">
                {table.fields.map((field) => (
                  <div className="min-w-200 flex-1" key={field.key}>
                    {field.type === 'select' ? (
                      <Select
                        data-testid={`brick-instruction-field-${field.key}`}
                        disabled={locked}
                        label={field.label}
                        onChange={(event) => {
                          updateResponse({
                            fields: { ...fields, [field.key]: event.currentTarget.value },
                          });
                        }}
                        options={[
                          { value: '', label: t.choose },
                          ...(field.options ?? []).map((option) => ({
                            value: option.value,
                            label: option.label,
                          })),
                        ]}
                        value={fields[field.key] ?? ''}
                      />
                    ) : (
                      <TextField
                        data-testid={`brick-instruction-field-${field.key}`}
                        disabled={locked}
                        inputMode={field.type === 'number' ? 'decimal' : undefined}
                        label={field.label}
                        onChange={(event) => {
                          updateResponse({
                            fields: { ...fields, [field.key]: event.currentTarget.value },
                          });
                        }}
                        value={fields[field.key] ?? ''}
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            <div
              aria-label="Postes de la pièce"
              className="overflow-x-auto"
              role="region"
              tabIndex={0}
            >
              <div
                className="flex min-w-680 flex-col gap-6 text-14"
                data-testid="brick-table"
                role="table"
              >
                <div
                  className="grid items-center gap-8 text-12 font-600 text-ink-muted"
                  role="row"
                  style={{
                    gridTemplateColumns: `52px minmax(140px, 1.2fr) repeat(${String(
                      table.columns.length,
                    )}, minmax(140px, 1fr))${hasDerivedColumn ? ' 80px' : ''} 44px`,
                  }}
                >
                  <span role="columnheader">{t.tableRow}</span>
                  {table.columns.map((column) => (
                    <span key={column.key} role="columnheader">
                      {column.label}
                    </span>
                  ))}
                  {hasDerivedColumn ? <span role="columnheader">{derivedColumnLabel}</span> : null}
                  <span role="columnheader">
                    <span className="sr-only">{t.tableRemove}</span>
                  </span>
                </div>
                {rows.map((row, rowIndex) => (
                  <div
                    className="grid items-center gap-8"
                    key={`row-${String(rowIndex)}`}
                    role="row"
                  >
                    <span className="font-700 tabular-nums" role="cell">
                      {String(rowIndex + 1)}
                    </span>
                    {table.columns.map((column) => (
                      <span key={column.key} role="cell">
                        {column.type === 'select' ? (
                          <Select
                            data-testid={`brick-table-${String(rowIndex)}-${column.key}`}
                            disabled={locked}
                            hideLabel
                            label={`${column.label} du poste ${String(rowIndex + 1)}`}
                            onChange={(event) => {
                              const next = rows.map((entry, index) =>
                                index === rowIndex
                                  ? { ...entry, [column.key]: event.currentTarget.value }
                                  : entry,
                              );
                              updateResponse({ rows: next });
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
                            data-testid={`brick-table-${String(rowIndex)}-${column.key}`}
                            disabled={locked}
                            hideLabel
                            inputMode={column.type === 'number' ? 'decimal' : undefined}
                            label={`${column.label} du poste ${String(rowIndex + 1)}`}
                            onChange={(event) => {
                              const next = rows.map((entry, index) =>
                                index === rowIndex
                                  ? { ...entry, [column.key]: event.currentTarget.value }
                                  : entry,
                              );
                              updateResponse({ rows: next });
                            }}
                            value={row[column.key] ?? ''}
                          />
                        )}
                      </span>
                    ))}
                    {hasDerivedColumn ? (
                      <span className="text-13 font-700 text-indigo-ink-strong" role="cell">
                        {checkResults[0]?.sideByRow[rowIndex] ?? '—'}
                      </span>
                    ) : null}
                    <span role="cell">
                      {rows.length > table.minRows && !locked ? (
                        <button
                          aria-label={t.instructionRemoveRow(rowIndex + 1)}
                          className="inline-flex size-44 cursor-pointer items-center justify-center rounded-10 border-0 bg-canvas text-18 text-ink-muted"
                          data-testid={`brick-table-remove-${String(rowIndex)}`}
                          onClick={() => {
                            updateResponse({ rows: rows.filter((_, index) => index !== rowIndex) });
                          }}
                          type="button"
                        >
                          ×
                        </button>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-12">
              {!locked && rows.length < table.maxRows ? (
                <button
                  className="min-h-38 cursor-pointer rounded-10 border border-dashed border-border-dotted bg-surface px-14 text-13 font-600 text-ink"
                  data-testid="brick-table-add-row"
                  onClick={() => {
                    updateResponse({ rows: [...rows, {}] });
                  }}
                  type="button"
                >
                  {`+ ${t.instructionAddRow}`}
                </button>
              ) : (
                <span />
              )}
              <div
                aria-live="polite"
                className="ml-auto flex flex-wrap items-center gap-8 text-14 tabular-nums"
              >
                {checkResults.map((result) => (
                  <span className="flex flex-wrap items-center gap-8" key={result.index}>
                    <span>
                      {`${t.instructionDebit} `}
                      <strong>{`${formatFrenchNumber(result.leftSum)} €`}</strong>
                    </span>
                    <span>
                      {`${t.instructionCredit} `}
                      <strong>{`${formatFrenchNumber(result.rightSum)} €`}</strong>
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
                      data-testid="brick-table-state"
                    >
                      {result.label}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {production.kind === 'text' ? (
          <Textarea
            data-testid="brick-instruction-text"
            disabled={locked}
            label={t.instructionEntry}
            maxLength={production.maxChars}
            minLength={production.minChars}
            onChange={(event) => {
              updateResponse({ text: event.currentTarget.value });
            }}
            rows={6}
            value={current.text ?? ''}
          />
        ) : null}

        {production.kind === 'file' ? (
          <div className="flex flex-col gap-6">
            <label className="text-13 font-700 text-ink" htmlFor={`${generatedId}-file`}>
              {t.instructionEntry}
            </label>
            <input
              accept={production.accept.join(',')}
              className="min-h-48 cursor-pointer rounded-12 border border-solid border-border-strong bg-surface px-14 py-10 text-14 text-ink file:mr-12 file:cursor-pointer file:rounded-8 file:border-0 file:bg-canvas file:px-12 file:py-6 file:text-13 file:font-600 disabled:cursor-not-allowed"
              data-testid="brick-instruction-file"
              disabled={locked}
              id={`${generatedId}-file`}
              onChange={(event) => {
                onFileSelect?.(event.currentTarget.files?.[0] ?? null);
              }}
              type="file"
            />
          </div>
        ) : null}

        {production.kind === 'link' ? (
          <TextField
            data-testid="brick-instruction-link"
            disabled={locked}
            label={t.instructionEntry}
            onChange={(event) => {
              updateResponse({ url: event.currentTarget.value });
            }}
            type="url"
            value={current.url ?? ''}
          />
        ) : null}
      </section>

      {payload.explanationPrompt ? (
        <section
          aria-labelledby={`${generatedId}-explication`}
          className="flex flex-col gap-10 rounded-24 border border-solid border-border bg-surface px-24 py-22"
        >
          <h2 className="m-0 text-18 font-600" id={`${generatedId}-explication`}>
            {t.instructionExplanation}
          </h2>
          <Textarea
            data-testid="brick-instruction-explanation"
            disabled={locked}
            label={payload.explanationPrompt}
            onChange={(event) => {
              updateResponse({ explanation: event.currentTarget.value });
            }}
            rows={3}
            value={current.explanation ?? ''}
          />
        </section>
      ) : null}

      {hintsUsed > 0 && hints?.[hintsUsed - 1] ? (
        <div
          className="flex gap-12 rounded-18 bg-lime-softer px-16 py-14 text-lime-ink-strong"
          data-testid="brick-instruction-hint"
          role="status"
        >
          <strong className="shrink-0">{t.instructionHint(hintsUsed)}</strong>
          <span className="text-14 leading-1.5">{hints[hintsUsed - 1]}</span>
        </div>
      ) : null}

      {onHintRequest && hintsUsed < payload.hintsCount && !locked ? (
        <Button
          className="self-end"
          data-testid="brick-instruction-hint-request"
          onClick={onHintRequest}
          size="md"
          variant="outline"
        >
          {t.instructionRequestHint}
        </Button>
      ) : null}

      {corrected && review ? (
        <section
          aria-labelledby={`${generatedId}-correction`}
          className="flex flex-col gap-16 rounded-24 border border-solid border-border bg-surface p-24"
          data-testid="brick-instruction-review"
        >
          <div className="flex flex-wrap items-center justify-between gap-12">
            <div className="flex flex-col gap-4">
              <h2
                className="m-0 text-12 font-700 tracking-kicker text-ink-muted uppercase"
                id={`${generatedId}-correction`}
              >
                {t.instructionReview}
              </h2>
              <p className="m-0 font-display text-28 font-600">
                {t.instructionScore(review.score, review.maxScore)}
              </p>
            </div>
            <Badge tone={review.verdict === 'Réussi' ? 'lime' : 'orange'}>{review.verdict}</Badge>
          </div>
          <ul className="m-0 flex list-none flex-col gap-8 p-0">
            {review.criteria.map((criterion) => (
              <li
                className="flex items-start gap-12 rounded-12 bg-surface-subtle px-12 py-10"
                key={criterion.key}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-flex size-26 shrink-0 items-center justify-center rounded-full text-13 font-700',
                    criterion.ok
                      ? 'bg-green-soft text-green-ink'
                      : 'bg-orange-soft text-orange-ink',
                  )}
                >
                  {criterion.ok ? '✓' : '✗'}
                </span>
                <span className="flex flex-col gap-2">
                  <span className="text-14 font-700">
                    {criterion.label}
                    <span className="sr-only">{criterion.ok ? ' : réussi' : ' : à revoir'}</span>
                  </span>
                  {criterion.detail ? (
                    <span className="text-13 leading-1.5 text-ink-secondary">
                      {criterion.detail}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="m-0 rounded-16 bg-canvas px-16 py-14 text-15 leading-1.55">
            <strong>{'Le tuteur : '}</strong>
            {review.tutorNote}
          </p>
        </section>
      ) : null}
    </section>
  );
}
