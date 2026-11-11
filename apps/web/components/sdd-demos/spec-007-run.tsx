'use client';

import { useId, useState, type SyntheticEvent } from 'react';

import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec007;

// Fixed sample data: never user data (EF-6).
const SAMPLE_RUN_ID = 'sdd-demo-001';
const SAMPLE_VALUE = '4';
const STEP_NAMES = ['validate-input', 'persist-result'] as const;

type StepState = keyof typeof t.steps.statuses;
type ErrorCode = keyof typeof t.result.errors;

interface StepView {
  name: string;
  status: StepState;
  attempts: number;
}

interface RunResponse {
  status: 'completed' | 'failed';
  steps: StepView[];
  result: { runId: string; doubledValue: number } | null;
  error: { code: string } | null;
}

const fieldClass =
  'mt-2 block w-full rounded-[8px] border border-solid border-[#E7E6E1] p-2 font-mono';
const buttonClass =
  'mt-4 rounded-[8px] bg-[#111113] px-4 py-2 text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';

function errorMessage(code: string): string {
  return Object.hasOwn(t.result.errors, code)
    ? t.result.errors[code as ErrorCode]
    : t.result.errors.INTERNAL;
}

export function DemoJobRunner() {
  const runIdField = useId();
  const valueField = useId();
  const [runId, setRunId] = useState(SAMPLE_RUN_ID);
  const [value, setValue] = useState(SAMPLE_VALUE);
  const [pending, setPending] = useState(false);
  const [launchedRunId, setLaunchedRunId] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepView[]>(
    STEP_NAMES.map((name) => ({ name, status: 'pending', attempts: 0 })),
  );
  const [response, setResponse] = useState<RunResponse | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setUnavailable(false);
    setResponse(null);
    setLaunchedRunId(runId);
    setSteps(
      STEP_NAMES.map((name, i) => ({ name, status: i === 0 ? 'running' : 'pending', attempts: 0 })),
    );
    try {
      const res = await fetch('/api/v1/_dev/demo-job', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ runId, value: Number(value) }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as RunResponse;
      setSteps(body.steps);
      setResponse(body);
    } catch {
      // Transport details are never shown (EF-6).
      setSteps(STEP_NAMES.map((name) => ({ name, status: 'pending', attempts: 0 })));
      setUnavailable(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <DemoSection testId="spec-007-run" title={t.run.title}>
        <form onSubmit={(e) => void onSubmit(e)}>
          <label htmlFor={runIdField}>{t.run.runId}</label>
          <input
            id={runIdField}
            data-testid="spec-007-run-id"
            className={fieldClass}
            value={runId}
            onChange={(e) => {
              setRunId(e.target.value);
            }}
          />
          <label htmlFor={valueField} className="mt-4 block">
            {t.run.value}
          </label>
          <input
            id={valueField}
            data-testid="spec-007-value"
            type="number"
            step={1}
            className={fieldClass}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
            }}
          />
          <button
            type="submit"
            data-testid="spec-007-submit"
            className={buttonClass}
            disabled={pending}
          >
            {pending ? t.run.pending : t.run.submit}
          </button>
        </form>
      </DemoSection>
      <DemoSection testId="spec-007-steps" title={t.steps.title}>
        <p data-testid="spec-007-run-label">
          {launchedRunId === null ? t.steps.idle : t.steps.run(launchedRunId)}
        </p>
        <ol aria-live="polite" className="mt-2 list-decimal pl-6">
          {steps.map((s) => (
            <li key={s.name} data-testid={`spec-007-step-${s.name}`} className="py-1">
              <span className="font-mono">{s.name}</span>
              {` — ${t.steps.statuses[s.status]}`}
              {s.attempts > 1 ? ` (${t.steps.attempts(s.attempts)})` : null}
            </li>
          ))}
        </ol>
      </DemoSection>
      <DemoSection testId="spec-007-result" title={t.result.title}>
        <div aria-live="polite" data-testid="spec-007-result-body">
          {unavailable ? <p>{t.result.unavailable}</p> : null}
          {response === null && !unavailable ? <p>{t.result.empty}</p> : null}
          {response?.result ? (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
              <dt>{t.result.runId}</dt>
              <dd className="font-mono">{response.result.runId}</dd>
              <dt>{t.result.doubledValue}</dt>
              <dd data-testid="spec-007-doubled" className="font-mono">
                {response.result.doubledValue}
              </dd>
            </dl>
          ) : null}
          {response?.error ? (
            <p className="text-[#B42318]">
              {`${t.result.failed} : ${errorMessage(response.error.code)}`}
            </p>
          ) : null}
        </div>
      </DemoSection>
    </>
  );
}
