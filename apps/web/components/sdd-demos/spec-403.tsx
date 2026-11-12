'use client';

import { useState } from 'react';

import { ENGINE } from '@learny/config/product';
import {
  EngineError,
  calculateMastery,
  type MasteryAnswer,
  type MasteryResult,
} from '@learny/learning-engine';
import { Badge, Button, ProgressBar } from '@learny/ui';

import { fr } from '../../messages/fr';
import { BaseTokenStyle } from '../sdd/base-tokens';

const t = fr.sdd.spec403;

// ADR-0047: the demonstration uses the frozen reference instant, never the system clock.
const AT = '2026-11-11T12:20:00.000Z';
const HALF_LIFE_DAYS = ENGINE.mastery.halfLifeDays;
const THRESHOLD = ENGINE.mastery.threshold;
const PARAMS = { at: AT, threshold: THRESHOLD, halfLifeDays: HALF_LIFE_DAYS } as const;

const INITIAL_ANSWERS: readonly MasteryAnswer[] = [
  {
    answerId: 'answer-old',
    attemptId: 'attempt-quiz-1',
    score: 1,
    answeredAt: '2026-10-28T12:20:00.000Z',
  },
  {
    answerId: 'answer-recent',
    attemptId: 'attempt-quiz-1',
    score: 0,
    answeredAt: AT,
  },
];

const EDGE_EMPTY = calculateMastery({ ...PARAMS, answers: [] });
const EDGE_BELOW = calculateMastery({
  ...PARAMS,
  answers: [{ answerId: 'edge-below', attemptId: 'edge', score: 0.79999, answeredAt: AT }],
});
const EDGE_THRESHOLD = calculateMastery({
  ...PARAMS,
  answers: [{ answerId: 'edge-threshold', attemptId: 'edge', score: 0.8, answeredAt: AT }],
});

function rejectionCode(answers: readonly MasteryAnswer[]): string {
  try {
    calculateMastery({ ...PARAMS, answers });
    return 'ACCEPTÉE';
  } catch (error) {
    return error instanceof EngineError ? error.code : 'ERREUR';
  }
}

const EDGE_FUTURE_CODE = rejectionCode([
  { answerId: 'edge-future', attemptId: 'edge', score: 1, answeredAt: '2026-11-11T12:20:00.001Z' },
]);

const percentFormat = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const edgePercentFormat = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const weightFormat = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const scoreFormat = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const instantFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  dateStyle: 'short',
  timeStyle: 'short',
});

const percent = (value: number): string => `${percentFormat.format(value)}\u00a0%`;
const edgePercent = (value: number): string => `${edgePercentFormat.format(value)}\u00a0%`;
const weight = (value: number): string => weightFormat.format(value);
const score = (value: number): string => scoreFormat.format(value);
const instant = (value: string): string => instantFormat.format(new Date(value));

const CARD = 'mt-6 rounded-24 border border-solid border-border bg-surface p-6';
const CAPTION = 'border-b border-border py-2 pr-3 text-left font-600';

function StatusBadge({ mastered, testId }: Readonly<{ mastered: boolean; testId: string }>) {
  return (
    <Badge tone={mastered ? 'green' : 'orange'} data-testid={testId}>
      {mastered ? t.result.mastered : t.result.notMastered}
    </Badge>
  );
}

function EdgeRow({
  testId,
  label,
  result,
  rejected,
}: Readonly<{
  testId: string;
  label: string;
  result?: MasteryResult;
  rejected?: string;
}>) {
  return (
    <tr data-testid={testId}>
      <td className="border-b border-divider py-2 pr-3 font-600">{label}</td>
      <td className="border-b border-divider py-2 pr-3 tabular-nums">
        {result === undefined
          ? t.edge.rejected(rejected ?? 'INVALID_INPUT')
          : edgePercent(result.mastery)}
      </td>
      <td className="border-b border-divider py-2">
        {result === undefined ? (
          '—'
        ) : (
          <Badge tone={result.mastered ? 'green' : 'orange'}>
            {result.mastered ? t.edge.mastered : t.edge.notMastered}
          </Badge>
        )}
      </td>
    </tr>
  );
}

export default function Spec403Demo() {
  const [answers, setAnswers] = useState<readonly MasteryAnswer[]>(INITIAL_ANSWERS);
  const result = calculateMastery({ ...PARAMS, answers });

  function addAnswer(): void {
    setAnswers((current) => {
      const index = current.length - INITIAL_ANSWERS.length + 1;
      return [
        ...current,
        {
          answerId: `answer-added-${String(index)}`,
          attemptId: 'attempt-added',
          score: 1,
          answeredAt: AT,
        },
      ];
    });
  }

  return (
    <>
      <BaseTokenStyle />
      <section data-testid="mastery-inputs" className={CARD}>
        <h2 className="font-display text-xl font-600">{t.inputs.title}</h2>
        <p className="mt-2 text-sm text-ink-muted">{t.inputs.intro}</p>
        <code
          data-testid="mastery-formula"
          className="mt-3 block break-words rounded-12 bg-canvas px-3 py-2 font-mono text-sm"
        >
          {t.inputs.formula}
        </code>
        <p data-testid="mastery-evaluation" className="mt-3 text-sm">
          {t.inputs.evaluation(instant(AT))}
        </p>
        {answers.length === 0 ? (
          <p className="mt-3 text-sm">{t.inputs.empty}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">{t.inputs.title}</caption>
              <thead>
                <tr>
                  <th scope="col" className={CAPTION}>
                    {t.inputs.answer}
                  </th>
                  <th scope="col" className={`${CAPTION} hidden sm:table-cell`}>
                    {t.inputs.attempt}
                  </th>
                  <th scope="col" className={CAPTION}>
                    {t.inputs.answeredAt}
                  </th>
                  <th scope="col" className={CAPTION}>
                    {t.inputs.score}
                  </th>
                  <th scope="col" className={`${CAPTION} hidden sm:table-cell`}>
                    {t.inputs.age}
                  </th>
                  <th scope="col" className={CAPTION}>
                    {t.inputs.weight}
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.weights.map((item) => (
                  <tr key={item.answerId} data-testid={`mastery-answer-${item.answerId}`}>
                    <td className="border-b border-divider py-2 pr-3 font-mono text-xs">
                      {item.answerId}
                    </td>
                    <td className="hidden border-b border-divider py-2 pr-3 font-mono text-xs sm:table-cell">
                      {item.attemptId}
                    </td>
                    <td className="border-b border-divider py-2 pr-3 tabular-nums">
                      {instant(item.answeredAt)}
                    </td>
                    <td className="border-b border-divider py-2 pr-3 tabular-nums">
                      {score(item.score)}
                    </td>
                    <td className="hidden border-b border-divider py-2 pr-3 tabular-nums sm:table-cell">
                      {scoreFormat.format(item.ageDays)}
                    </td>
                    <td
                      data-testid={`mastery-weight-${item.answerId}`}
                      className="border-b border-divider py-2 tabular-nums"
                    >
                      {weight(item.weight)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Button data-testid="mastery-add-answer" className="mt-4" onClick={addAnswer}>
          {t.inputs.add}
        </Button>
      </section>

      <section data-testid="mastery-result" className={CARD}>
        <h2 className="font-display text-xl font-600">{t.result.title}</h2>
        <div role="status" aria-live="polite" className="mt-3 flex flex-wrap items-center gap-3">
          <p data-testid="mastery-value" className="font-display text-34 font-600 tabular-nums">
            {percent(result.mastery)}
          </p>
          <StatusBadge mastered={result.mastered} testId="mastery-status" />
        </div>
        <div className="relative mt-4">
          <ProgressBar
            data-testid="mastery-bar"
            label={t.result.bar}
            tone={result.mastered ? 'lime' : 'orange'}
            value={result.mastery}
          />
          <span
            aria-hidden="true"
            data-testid="mastery-threshold-marker"
            className="absolute inset-y-0 w-px bg-ink"
            style={{ left: `${String(result.threshold)}%` }}
          />
        </div>
        <p data-testid="mastery-threshold" className="mt-2 text-sm font-600">
          {t.result.threshold(percentFormat.format(result.threshold))}
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">{t.inputs.answer}</dt>
            <dd data-testid="mastery-answer-count" className="font-600">
              {t.result.answerCount(result.answerCount)}
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">{t.inputs.weight}</dt>
            <dd data-testid="mastery-weight-sum" className="font-mono font-600">
              {weight(result.weightSum)}
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">Σ(poids × score)</dt>
            <dd data-testid="mastery-weighted-score" className="font-mono font-600">
              {weight(result.weightedScore)}
            </dd>
          </div>
        </dl>
      </section>

      <section data-testid="mastery-edge" className={CARD}>
        <h2 className="font-display text-xl font-600">{t.edge.title}</h2>
        <p className="mt-2 text-sm text-ink-muted">{t.edge.intro}</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{t.edge.title}</caption>
            <thead>
              <tr>
                <th scope="col" className={CAPTION}>
                  {t.inputs.answer}
                </th>
                <th scope="col" className={CAPTION}>
                  {t.inputs.score}
                </th>
                <th scope="col" className={CAPTION}>
                  {t.result.title}
                </th>
              </tr>
            </thead>
            <tbody>
              <EdgeRow testId="mastery-edge-empty" label={t.edge.empty} result={EDGE_EMPTY} />
              <EdgeRow testId="mastery-edge-below" label={t.edge.below} result={EDGE_BELOW} />
              <EdgeRow
                testId="mastery-edge-threshold"
                label={t.edge.threshold}
                result={EDGE_THRESHOLD}
              />
              <EdgeRow
                testId="mastery-edge-future"
                label={t.edge.future}
                rejected={EDGE_FUTURE_CODE}
              />
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
