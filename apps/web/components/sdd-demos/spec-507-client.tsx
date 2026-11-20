'use client';

import { useEffect, useRef, useState } from 'react';

import { api } from '@learny/api-client';
import type { AiTask } from '@learny/config';
import { fr } from '@learny/i18n/fr/sdd';

import { BaseCard } from '../sdd/base-tokens';

const t = fr.sdd.spec507;
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
  cost: string;
}

export interface Spec507BudgetData {
  spentUsd: string;
  spentLabel: string;
  task: AiTask;
  estimatedLabel: string;
  decision: {
    alert: boolean;
    decision: 'allow' | 'defer' | 'downgrade';
    model: string;
    estimatedCostUsd: string;
    percentUsed: number;
  };
  validInput: Record<string, unknown>;
  failure: string;
  resetsLabel: string;
  calls: DemoCall[];
  aggregates: Array<{ day: string; formation: string; calls: number; cost: string }>;
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

export default function Spec507Demo({ initial }: Readonly<{ initial: Spec507BudgetData }>) {
  const [spend, setSpend] = useState('0');
  const [task, setTask] = useState<AiTask>('tutor');
  const [data, setData] = useState(initial);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    let active = true;
    void api.devSddSpec507Budget({ body: { spend, task } }).then((next) => {
      if (active) setData(next as Spec507BudgetData);
    });
    return () => {
      active = false;
    };
  }, [spend, task]);
  const decision = data.decision;
  const percent = Math.min(100, decision.percentUsed);

  return (
    <>
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
            <span data-testid="spec-507-spend-value">{data.spentLabel}</span>
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
            <dd data-testid="spec-507-estimate">{data.estimatedLabel}</dd>
          </div>
          <div>
            <dt className="font-semibold">{t.budget.resets}</dt>
            <dd data-testid="spec-507-resets">{data.resetsLabel}</dd>
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
              {data.calls.map((call) => (
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
                  <td className="px-3 py-2 font-mono">{call.cost}</td>
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
            {data.aggregates.map((row) => (
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
              {JSON.stringify(data.validInput, null, 2)}
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
              {`VALIDATION_FAILED · ${data.failure}`}
            </p>
          </div>
        </div>
      </BaseCard>
    </>
  );
}
