'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { HourlyTickUser } from '@learny/contracts';
import { zonedParts } from '@learny/core';

import { ApiError, api } from '../../lib/api-client';
import { qk } from '../../lib/query-keys';
import { fr } from '../../messages/fr';
import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

const t = fr.sdd.spec203;

const buttonClass =
  'rounded-[12px] bg-[#111113] px-4 py-2 text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';

// State colours (SPEC-203 §10): decorative indicators only; the state is always written out.
const COLORS = { waiting: '#E7E6E1', retrying: '#F97316', done: '#0F9F7F' } as const;
type StepState = keyof typeof COLORS;

const STEP_NAMES = ['step-1-prepare', 'step-2-process', 'step-3-finish'] as const;
const POLL_MS = 1000;
const DEFAULT_TICK = '2026-11-11T07:05:00Z';

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.code} (${String(error.status)})${error.requestId === undefined ? '' : ` · ${error.requestId}`}`;
  }
  return String(error);
}

function stateLabel(state: StepState): string {
  return state === 'done' ? t.demo.done : state === 'retrying' ? t.demo.retrying : t.demo.waiting;
}

function Dot({ state, testId }: Readonly<{ state: StepState; testId?: string }>) {
  return (
    <span
      aria-hidden="true"
      {...(testId === undefined ? {} : { 'data-testid': testId })}
      className="inline-block size-3 shrink-0 rounded-full border border-solid border-[#E7E6E1]"
      style={{ backgroundColor: COLORS[state] }}
    />
  );
}

function Pipeline() {
  const queryClient = useQueryClient();
  const [fail, setFail] = useState(false);
  const [run, setRun] = useState<{ runId: string; fail: boolean } | null>(null);

  const start = useMutation({
    mutationFn: () =>
      api.devEventsDemoStart(
        { body: { failOnceAt: fail ? 'step-2' : 'none' } },
        { idempotencyKey: crypto.randomUUID() },
      ),
    onSuccess: (accepted) => {
      setRun({ runId: accepted.jobId, fail });
      void queryClient.invalidateQueries({ queryKey: qk.devJobsOutbox() });
    },
  });

  const status = useQuery({
    queryKey: qk.devJobsRun(run?.runId ?? ''),
    enabled: run !== null,
    queryFn: () => api.devEventsDemoRun({ params: { runId: run?.runId ?? '' } }),
    // Polled every second until the run is finished (ADR-0065, adapted to the demonstration).
    refetchInterval: (query) => (query.state.data?.finishedAt == null ? POLL_MS : false),
  });

  const data = status.data;
  const stateOf = (index: number): StepState => {
    const name = STEP_NAMES[index] ?? '';
    if (data?.steps.some((step) => step.name === name) === true) return 'done';
    if (index === 1 && run?.fail === true && (data?.attempts ?? 0) >= 1) return 'retrying';
    return 'waiting';
  };

  return (
    <BaseCard testId="jobs-demo" title={t.demo.title}>
      <p className="mb-3 text-sm">{t.demo.intro}</p>
      <div className="mb-3 flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={fail}
          aria-label={t.demo.failSwitch}
          onClick={() => {
            setFail((value) => !value);
          }}
          className="relative h-7 w-12 rounded-full border border-solid border-[#E7E6E1] focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ backgroundColor: fail ? '#111113' : '#E7E6E1' }}
        >
          <span
            aria-hidden="true"
            className="absolute top-0.5 size-5 rounded-full bg-white"
            style={{ left: fail ? '1.5rem' : '0.125rem' }}
          />
        </button>
        <span className="text-sm">{t.demo.failSwitch}</span>
      </div>
      <button
        type="button"
        className={buttonClass}
        disabled={start.isPending}
        onClick={() => {
          start.mutate();
        }}
      >
        {t.demo.emit}
      </button>
      <div aria-live="polite" aria-busy={start.isPending || status.isFetching}>
        {start.isError ? (
          <p role="alert" className="mt-3 text-sm">
            {`${t.demo.error} ${describeError(start.error)}`}
          </p>
        ) : null}
        <ol className="mt-4 space-y-2">
          {t.demo.steps.map((label, index) => {
            const state = stateOf(index);
            return (
              <li
                key={label}
                data-testid={`jobs-step-${String(index + 1)}`}
                data-state={state}
                className="flex items-center gap-3 text-sm"
              >
                <Dot state={state} testId={`jobs-step-${String(index + 1)}-dot`} />
                <span className="font-semibold">{`${String(index + 1)}. ${label}`}</span>
                <span data-testid={`jobs-step-${String(index + 1)}-state`}>
                  {stateLabel(state)}
                </span>
              </li>
            );
          })}
        </ol>
        <p data-testid="jobs-attempts" className="mt-3 text-sm font-semibold">
          {t.demo.attempts(data?.attempts ?? 0)}
        </p>
      </div>
      <ul data-testid="jobs-legend" className="mt-4 flex flex-wrap gap-4 text-xs">
        {(['waiting', 'retrying', 'done'] as const).map((state) => (
          <li key={state} className="flex items-center gap-2">
            <Dot state={state} testId={`jobs-legend-${state}`} />
            {stateLabel(state)}
          </li>
        ))}
      </ul>
    </BaseCard>
  );
}

function localWindow(user: HourlyTickUser): string {
  const end = zonedParts(user.windowEnd, user.timezone);
  const hhmm = `${String(end.hour).padStart(2, '0')}:${String(end.minute).padStart(2, '0')}`;
  return `${user.localStart}–${hhmm}`;
}

function TickCard() {
  const [at, setAt] = useState(DEFAULT_TICK);
  const tick = useMutation({
    mutationFn: () => api.devCronHourlyTick({ body: { at } }),
  });
  const users = [...(tick.data?.users ?? [])].sort(
    (a, b) => a.timezone.localeCompare(b.timezone) || a.userId.localeCompare(b.userId),
  );

  return (
    <BaseCard testId="jobs-tick" title={t.tick.title}>
      <p className="mb-3 text-sm">{t.tick.intro}</p>
      <label htmlFor="jobs-tick-at" className="block text-sm font-semibold">
        {t.tick.label}
      </label>
      <input
        id="jobs-tick-at"
        type="text"
        value={at}
        onChange={(event) => {
          setAt(event.target.value);
        }}
        className="mb-3 mt-1 w-full rounded-[12px] border border-solid border-[#E7E6E1] px-3 py-2"
      />
      <button
        type="button"
        className={buttonClass}
        disabled={tick.isPending}
        onClick={() => {
          tick.mutate();
        }}
      >
        {t.tick.action}
      </button>
      <div aria-live="polite" aria-busy={tick.isPending}>
        {tick.isError ? (
          <p role="alert" className="mt-3 text-sm">
            {tick.error instanceof ApiError && tick.error.code === 'VALIDATION_FAILED'
              ? t.tick.invalid
              : describeError(tick.error)}
          </p>
        ) : null}
        {tick.isSuccess ? (
          <>
            <p data-testid="jobs-tick-count" className="mt-3 text-sm font-semibold">
              {t.tick.selected(users.length)}
            </p>
            <div className="mt-2 overflow-x-auto">
              <table data-testid="jobs-tick-table" className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {t.tick.columns.map((column) => (
                      <th key={column} scope="col" className="py-1 pr-3 font-semibold">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.userId} data-testid="jobs-tick-row">
                      <th scope="row" className="py-1 pr-3 font-normal">
                        {user.userId.slice(0, 8)}
                      </th>
                      <td className="py-1 pr-3">{user.timezone}</td>
                      <td className="py-1 pr-3">{localWindow(user)}</td>
                      <td className="py-1 pr-3">{user.localDate}</td>
                      <td className="py-1 pr-3">
                        {`${t.tick.weekdays[user.localWeekday - 1] ?? ''} (${String(user.localWeekday)})`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {users.length === 0 ? <p className="mt-2 text-sm">{t.tick.empty}</p> : null}
          </>
        ) : null}
      </div>
    </BaseCard>
  );
}

function OutboxCard() {
  const counts = useQuery({
    queryKey: qk.devJobsOutbox(),
    queryFn: () => api.devEventsOutbox({}),
    refetchInterval: POLL_MS * 2,
  });
  const entries = [
    ['pending', t.outbox.pending, counts.data?.pending],
    ['sent', t.outbox.sent, counts.data?.sent],
    ['failed', t.outbox.failed, counts.data?.failed],
  ] as const;

  return (
    <BaseCard testId="jobs-outbox" title={t.outbox.title}>
      <p className="mb-3 text-sm">{t.outbox.intro}</p>
      <dl aria-live="polite" className="grid grid-cols-3 gap-4 text-sm">
        {entries.map(([key, label, value]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd data-testid={`jobs-outbox-${key}`} className="text-2xl font-semibold">
              {value === undefined ? '–' : String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </BaseCard>
  );
}

export default function Spec203Demo() {
  return (
    <>
      <BaseTokenStyle />
      <Pipeline />
      <TickCard />
      <OutboxCard />
    </>
  );
}
