'use client';

import type {
  Spec511BudgetRow,
  Spec511Data,
  Spec511ResultRow,
} from '../../app/%5Fdev/sdd/spec-511-data';
import { fr } from '../../messages/fr';
import { BaseCard } from '../sdd/base-tokens';

const t = fr.sdd.spec511;

function scoreLabel(score: number): string {
  return score.toFixed(3);
}

function Results({ data }: Readonly<{ data: Spec511Data }>) {
  return (
    <>
      <p data-testid="spec-511-member-excluded" className="mt-0 text-13 text-ink-muted">
        {t.results.memberExcluded(data.memberExcluded)}
      </p>
      <div
        role="region"
        aria-label={t.results.title}
        tabIndex={0}
        className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <table className="w-full min-w-[48rem] text-left text-13">
          <thead>
            <tr className="border-b border-solid border-border">
              <th scope="col" className="px-2 py-2">
                {t.results.position}
              </th>
              <th scope="col" className="px-2 py-2">
                {t.results.source}
              </th>
              <th scope="col" className="px-2 py-2">
                {t.results.location}
              </th>
              <th scope="col" className="px-2 py-2">
                {t.results.score}
              </th>
              <th scope="col" className="px-2 py-2">
                {t.results.tokens}
              </th>
              <th scope="col" className="px-2 py-2">
                {t.results.excerpt}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((result: Spec511ResultRow, index: number) => (
              <tr
                key={result.chunkId}
                data-testid={`spec-511-result-${String(index)}`}
                className="border-b border-solid border-border"
              >
                <td className="px-2 py-2 font-mono">{result.position}</td>
                <td className="px-2 py-2">{result.source}</td>
                <td className="px-2 py-2 font-mono">{result.location}</td>
                <td className="px-2 py-2 font-mono" data-testid={`spec-511-score-${String(index)}`}>
                  {scoreLabel(result.score)}
                </td>
                <td className="px-2 py-2 font-mono">{result.tokenCount}</td>
                <td className="px-2 py-2">{result.preview}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function BudgetRow({ row }: Readonly<{ row: Spec511BudgetRow }>) {
  const percent = Math.min(100, Math.round((row.used / row.budget) * 100));
  const label = t.budgets.labels[row.task];
  return (
    <tr
      data-testid={`spec-511-budget-row-${row.task}`}
      className="border-b border-solid border-border"
    >
      <th scope="row" className="px-2 py-2 text-left">
        {label}
      </th>
      <td className="px-2 py-2 font-mono" data-testid={`spec-511-budget-budget-${row.task}`}>
        {row.budget}
      </td>
      <td className="px-2 py-2 font-mono" data-testid={`spec-511-budget-used-${row.task}`}>
        {t.budgets.within(row.used, row.budget)}
      </td>
      <td className="px-2 py-2 font-mono">{row.selected}</td>
      <td className="px-2 py-2 font-mono">{row.duplicates}</td>
      <td className="px-2 py-2 font-mono" data-testid={`spec-511-budget-omitted-${row.task}`}>
        {row.omitted}
      </td>
      <td className="px-2 py-2">
        <div
          role="progressbar"
          aria-label={`${label} : ${t.budgets.within(row.used, row.budget)}`}
          aria-valuemin={0}
          aria-valuemax={row.budget}
          aria-valuenow={row.used}
          className="h-2 w-full min-w-32 overflow-hidden rounded-full bg-canvas"
        >
          <div className="h-2 rounded-full bg-green" style={{ width: `${String(percent)}%` }} />
        </div>
      </td>
    </tr>
  );
}

export function Spec511View({ data }: Readonly<{ data: Spec511Data }>) {
  return (
    <>
      <p className="mt-6 text-sm">{t.intro}</p>

      <BaseCard testId="spec-511-query-card" title={t.query.title}>
        <dl className="m-0 grid grid-cols-1 gap-2 text-13 sm:grid-cols-[10rem_1fr]">
          <dt className="text-ink-muted">{t.query.label}</dt>
          <dd className="m-0">{data.query}</dd>
          <dt className="text-ink-muted">{t.query.vector}</dt>
          <dd className="m-0 font-mono" data-testid="spec-511-query-vector">
            {t.query.dimensions(1024)}
          </dd>
        </dl>
        <p className="mt-3 text-12 text-ink-muted">{t.query.note}</p>
      </BaseCard>

      <BaseCard testId="spec-511-results-card" title={t.results.title}>
        <Results data={data} />
      </BaseCard>

      <BaseCard testId="spec-511-budget-card" title={t.budgets.title}>
        <div
          role="region"
          aria-label={t.budgets.title}
          tabIndex={0}
          className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <table className="w-full min-w-[48rem] text-left text-13">
            <thead>
              <tr className="border-b border-solid border-border">
                <th scope="col" className="px-2 py-2">
                  {t.budgets.task}
                </th>
                <th scope="col" className="px-2 py-2">
                  {t.budgets.budget}
                </th>
                <th scope="col" className="px-2 py-2">
                  {t.budgets.used}
                </th>
                <th scope="col" className="px-2 py-2">
                  {t.budgets.selected}
                </th>
                <th scope="col" className="px-2 py-2">
                  {t.budgets.duplicates}
                </th>
                <th scope="col" className="px-2 py-2">
                  {t.budgets.omitted}
                </th>
                <th scope="col" className="px-2 py-2">
                  {t.budgets.used}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.budgets.map((row) => (
                <BudgetRow key={row.task} row={row} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-12 text-ink-muted">{t.budgets.note}</p>
      </BaseCard>

      <BaseCard testId="spec-511-context-card" title={t.selection.title}>
        <p className="mt-0 text-13" data-testid="spec-511-selection-summary">
          {t.selection.summary(data.selection.selected, data.selection.used, data.selection.budget)}
        </p>
        <p className="mt-1 text-12 text-ink-muted">
          {t.selection.duplicates(data.selection.duplicates)} ·{' '}
          {t.selection.omitted(data.selection.omitted)}
        </p>
        <h3 className="mt-4 font-display text-base font-semibold">{t.selection.preview}</h3>
        <pre
          data-testid="spec-511-context-preview"
          className="mt-2 max-h-96 overflow-auto rounded-12 bg-canvas p-4 text-12"
        >
          {data.selection.preview}
        </pre>
        {data.selection.truncated ? (
          <p className="mt-2 text-12 text-ink-muted" data-testid="spec-511-context-truncated">
            {t.selection.truncated}
          </p>
        ) : null}
      </BaseCard>

      <BaseCard testId="spec-511-trap-card" title={t.trap.title}>
        <h3 className="mt-0 font-display text-base font-semibold">{t.trap.raw}</h3>
        <pre
          data-testid="spec-511-trap-raw"
          className="mt-2 overflow-x-auto rounded-12 bg-canvas p-4 text-12"
        >
          {data.trap.raw}
        </pre>
        <h3 className="mt-4 font-display text-base font-semibold">{t.trap.formatted}</h3>
        <pre
          data-testid="spec-511-trap-formatted"
          className="mt-2 overflow-x-auto rounded-12 bg-canvas p-4 text-12"
        >
          {data.trap.formatted}
        </pre>
        <p className="mt-3 text-12 text-ink-muted">{t.trap.note}</p>
      </BaseCard>

      <BaseCard testId="spec-511-empty-card" title={t.noMatches.title}>
        <p className="mt-0 text-13" data-testid="spec-511-no-matches">
          {t.noMatches.body} (reason : {data.noMatches.reason}, {data.noMatches.count} passage).
        </p>
      </BaseCard>

      <BaseCard testId="spec-511-failure-card" title={t.failure.title}>
        <p className="mt-0 text-13">{t.failure.body}</p>
        <p className="mt-2 text-13">
          {t.failure.code} :{' '}
          <span className="font-mono" data-testid="spec-511-failure-code">
            {data.failure.code}
          </span>
        </p>
        <p className="mt-1 text-13">
          {t.failure.message} :{' '}
          <span className="font-mono" data-testid="spec-511-failure-message">
            {data.failure.message}
          </span>
        </p>
      </BaseCard>

      <BaseCard testId="spec-511-contract-card" title={t.contract.title}>
        <h3 className="mt-0 font-display text-base font-semibold">{t.contract.input}</h3>
        <pre
          data-testid="spec-511-contract-input"
          className="mt-2 overflow-x-auto rounded-12 bg-canvas p-4 text-12"
        >
          {JSON.stringify(data.contractInput, null, 2)}
        </pre>
        <h3 className="mt-4 font-display text-base font-semibold">{t.contract.output}</h3>
        <pre
          data-testid="spec-511-contract-output"
          className="mt-2 overflow-x-auto rounded-12 bg-canvas p-4 text-12"
        >
          {JSON.stringify(data.contractOutput, null, 2)}
        </pre>
        <p className="mt-3 text-12 text-ink-muted">{t.contract.note}</p>
      </BaseCard>
    </>
  );
}
