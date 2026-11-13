'use client';

import { useState } from 'react';

import { AI_MODEL_IDS, DEFAULT_MODEL_BY_TASK, type AiTask } from '@learny/config';
import { userDayBounds } from '@learny/core';
import {
  budgetCheckSchema,
  calculateUsageCost,
  checkBudget,
  formatUsdMicros,
  parseUsdMicros,
} from '@learny/llm/budget';

import { fr } from '../../messages/fr';
import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

const t = fr.sdd.spec507;
const AT = new Date('2026-11-11T12:20:00Z');
const CAP = '1.500000';
const USER = '11111111-1111-4111-8111-111111111111';
const RESETS_AT = userDayBounds('2026-11-11', 'Europe/Paris').end;
const RESETS_LABEL = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  dateStyle: 'full',
  timeStyle: 'short',
}).format(RESETS_AT);

const TASKS: readonly AiTask[] = ['programme', 'course', 'gaps', 'tutor', 'light'];

interface DemoCall {
  day: string;
  formation: string;
  task: AiTask;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  status: 'ok' | 'error' | 'refused' | 'capped';
  batch: boolean;
}

const CALLS: readonly DemoCall[] = [
  {
    day: '2026-11-11',
    formation: 'SAP S/4HANA Finance',
    task: 'tutor',
    model: AI_MODEL_IDS.sonnet,
    inputTokens: 2_400,
    outputTokens: 600,
    cacheReadTokens: 1_200,
    cacheWriteTokens: 0,
    status: 'ok',
    batch: false,
  },
  {
    day: '2026-11-11',
    formation: 'SAP S/4HANA Finance',
    task: 'light',
    model: AI_MODEL_IDS.haiku,
    inputTokens: 800,
    outputTokens: 200,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    status: 'ok',
    batch: true,
  },
  {
    day: '2026-11-11',
    formation: 'SAP S/4HANA Finance',
    task: 'programme',
    model: AI_MODEL_IDS.opus,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    status: 'capped',
    batch: false,
  },
  {
    day: '2026-11-10',
    formation: 'Hors formation',
    task: 'gaps',
    model: AI_MODEL_IDS.opus,
    inputTokens: 1_200,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    status: 'refused',
    batch: false,
  },
];

function costOf(call: DemoCall): string {
  return calculateUsageCost({
    model: call.model,
    managed: true,
    usage: {
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      cacheReadTokens: call.cacheReadTokens,
      cacheWriteTokens: call.cacheWriteTokens,
    },
    batch: call.batch,
  }).costUsd;
}

function aggregates(): { day: string; formation: string; calls: number; cost: string }[] {
  const groups = new Map<
    string,
    { day: string; formation: string; calls: number; micros: number }
  >();
  for (const call of CALLS) {
    const key = `${call.day}/${call.formation}`;
    const current = groups.get(key) ?? {
      day: call.day,
      formation: call.formation,
      calls: 0,
      micros: 0,
    };
    current.calls += 1;
    current.micros += parseUsdMicros(costOf(call));
    groups.set(key, current);
  }
  return [...groups.values()].map((group) => ({
    day: group.day,
    formation: group.formation,
    calls: group.calls,
    cost: formatUsdMicros(group.micros),
  }));
}

function statusLabel(status: DemoCall['status']): string {
  switch (status) {
    case 'ok':
      return 'ok';
    case 'error':
      return 'erreur';
    case 'refused':
      return 'refusé';
    default:
      return 'plafonné';
  }
}

export default function Spec507Demo() {
  const [spend, setSpend] = useState('0');
  const [task, setTask] = useState<AiTask>('tutor');
  const numericSpend = Number(spend);
  const spentUsd = Number.isFinite(numericSpend)
    ? Math.max(0, numericSpend).toFixed(6)
    : '0.000000';
  const model = DEFAULT_MODEL_BY_TASK[task];
  const decision = checkBudget({
    userId: USER,
    task,
    model,
    estimatedTokens: { inputTokens: 4_000, outputTokens: 1_000 },
    at: AT,
    capUsd: CAP,
    spentUsd,
  });
  const percent = Math.min(100, decision.percentUsed);
  const validInput = {
    userId: USER,
    task,
    model,
    estimatedTokens: { inputTokens: 4_000, outputTokens: 1_000 },
    at: AT.toISOString(),
    capUsd: CAP,
    spentUsd,
  };
  const invalid = budgetCheckSchema.safeParse({ ...validInput, capUsd: '0' });
  const failure = invalid.success
    ? 'validation inattendue'
    : (invalid.error.issues[0]?.message ?? 'entrée refusée');

  return (
    <>
      <BaseTokenStyle />
      <BaseCard testId="spec-507-budget" title={t.budget.title}>
        <p className="text-13 text-ink-secondary">{t.budget.intro}</p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-13">
            <span>{t.budget.spend}</span>
            <input
              type="number"
              min="0"
              max="3"
              step="0.01"
              value={spend}
              data-testid="spec-507-spend"
              onChange={(event) => {
                setSpend(event.target.value);
              }}
              className="w-32 rounded-12 border border-solid border-border bg-surface px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-13">
            <span>{t.budget.task}</span>
            <select
              value={task}
              data-testid="spec-507-task"
              onChange={(event) => {
                setTask(event.target.value as AiTask);
              }}
              className="rounded-12 border border-solid border-border bg-surface px-3 py-2"
            >
              {TASKS.map((entry) => (
                <option key={entry} value={entry}>
                  {t.budget.tasks[entry]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-4 text-13">
            <span data-testid="spec-507-spend-value">{`${formatUsdMicros(parseUsdMicros(spentUsd))} USD`}</span>
            <span>{t.budget.cap('1,50')}</span>
          </div>
          <div className="relative mt-2 h-3 overflow-hidden rounded-full bg-canvas">
            <div
              data-testid="spec-507-bar"
              role="progressbar"
              aria-label={t.budget.percent(decision.percentUsed)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-full rounded-full bg-ink"
              style={{ width: `${String(percent)}%` }}
            />
            <span aria-hidden="true" className="absolute inset-y-0 left-[80%] w-px bg-border" />
          </div>
          <p className="mt-1 text-12 text-ink-secondary">
            {t.budget.percent(decision.percentUsed)}
          </p>
        </div>

        <p
          data-testid="spec-507-alert"
          role="status"
          className="mt-4 rounded-12 bg-canvas p-3 text-13"
        >
          {decision.alert ? t.budget.alert : t.budget.noAlert}
        </p>

        <dl className="mt-4 grid gap-3 text-13 sm:grid-cols-2">
          <div>
            <dt className="font-semibold">{t.budget.decision}</dt>
            <dd data-testid="spec-507-decision">{t.budget.decisions[decision.decision]}</dd>
          </div>
          <div>
            <dt className="font-semibold">{t.budget.model}</dt>
            <dd data-testid="spec-507-model" className="font-mono">
              {decision.model}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">{t.budget.estimate}</dt>
            <dd data-testid="spec-507-estimate">
              {`${formatUsdMicros(parseUsdMicros(decision.estimatedCostUsd))} USD`}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">{t.budget.resets}</dt>
            <dd data-testid="spec-507-resets">{RESETS_LABEL}</dd>
          </div>
        </dl>
      </BaseCard>

      <BaseCard testId="spec-507-calls" title={t.calls.title}>
        <p className="text-13 text-ink-secondary">{t.calls.intro}</p>
        <div
          role="region"
          aria-label={t.calls.title}
          tabIndex={0}
          className="mt-3 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <table className="w-full min-w-[52rem] text-left text-13">
            <caption className="sr-only">{t.calls.title}</caption>
            <thead>
              <tr>
                {t.calls.columns.map((column) => (
                  <th key={column} scope="col" className="px-3 py-2">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CALLS.map((call) => (
                <tr
                  key={`${call.day}-${call.task}-${call.model}`}
                  data-testid="spec-507-call-row"
                  className="border-t border-border"
                >
                  <td className="px-3 py-2">{call.day}</td>
                  <td className="px-3 py-2">{call.formation}</td>
                  <td className="px-3 py-2">{t.budget.tasks[call.task]}</td>
                  <td className="px-3 py-2 font-mono">{call.model}</td>
                  <td className="px-3 py-2 font-mono">{`${String(call.inputTokens)}/${String(call.outputTokens)}`}</td>
                  <td className="px-3 py-2 font-mono">{costOf(call)}</td>
                  <td className="px-3 py-2">{statusLabel(call.status)}</td>
                  <td className="px-3 py-2">{call.batch ? t.calls.batchYes : t.calls.batchNo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mt-6 font-display text-lg font-semibold">{t.calls.aggregates}</h3>
        <table className="mt-2 w-full text-left text-13" data-testid="spec-507-aggregates">
          <caption className="sr-only">{t.calls.aggregates}</caption>
          <thead>
            <tr>
              {t.calls.aggregateColumns.map((column) => (
                <th key={column} scope="col" className="px-3 py-2">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {aggregates().map((row) => (
              <tr key={`${row.day}-${row.formation}`} className="border-t border-border">
                <td className="px-3 py-2">{row.day}</td>
                <td className="px-3 py-2">{row.formation}</td>
                <td className="px-3 py-2">{row.calls}</td>
                <td className="px-3 py-2 font-mono">{row.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </BaseCard>

      <BaseCard testId="spec-507-contract" title={t.contract.title}>
        <p className="text-13 text-ink-secondary">{t.contract.intro}</p>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="font-semibold">{t.contract.input}</h3>
            <pre
              data-testid="spec-507-contract-input"
              role="region"
              aria-label={t.contract.input}
              tabIndex={0}
              className="mt-2 overflow-x-auto rounded-12 bg-canvas p-4 text-12"
            >
              {JSON.stringify(validInput, null, 2)}
            </pre>
          </div>
          <div>
            <h3 className="font-semibold">{t.contract.result}</h3>
            <pre
              data-testid="spec-507-contract-result"
              role="region"
              aria-label={t.contract.result}
              tabIndex={0}
              className="mt-2 overflow-x-auto rounded-12 bg-canvas p-4 text-12"
            >
              {JSON.stringify(decision, null, 2)}
            </pre>
            <p className="mt-4 font-semibold">{t.contract.error}</p>
            <p
              data-testid="spec-507-contract-error"
              className="mt-1 rounded-12 bg-canvas p-3 text-13"
            >
              {`VALIDATION_FAILED · ${failure}`}
            </p>
          </div>
        </div>
      </BaseCard>
    </>
  );
}
