'use client';

import { useActionState, useState } from 'react';

import type { AiTask } from '@learny/config';

import { callScenario, type ActionState } from '../../app/%5Fdev/sdd/spec-504-actions';
import type { MockCallState } from '../../app/%5Fdev/sdd/spec-504-data';
import { BaseCard } from '../sdd/base-tokens';

const TASKS: { value: AiTask; label: string }[] = [
  { value: 'programme', label: 'Programme' },
  { value: 'course', label: 'Cours' },
  { value: 'gaps', label: 'Lacunes' },
  { value: 'tutor', label: 'Tuteur' },
  { value: 'light', label: 'Tâche légère' },
];

const SCENARIOS = [
  'demo',
  'demo-tool-call',
  'demo-refusal',
  'demo-timeout',
  'demo-object',
  'demo-invalid-object',
] as const;

const INITIAL: ActionState = { status: 'idle', call: null };

function callLine(call: MockCallState | null): string {
  if (call === null) return '—';
  const entry = call.call;
  if (entry === null) return `${call.task} · aucune ligne ai_calls`;
  return `${entry.task} · ${entry.model} · ${String(entry.inputTokens)}/${String(entry.outputTokens)} tokens · ${entry.status}${entry.errorCode === null ? '' : ` · ${entry.errorCode}`}`;
}

export function Spec504Form({
  previews,
}: Readonly<{ previews: Record<AiTask, unknown> }>) {
  const [task, setTask] = useState<AiTask>('tutor');
  const [state, action, pending] = useActionState(callScenario, INITIAL);
  const call = state.call;

  return (
    <>
      <BaseCard testId="llm-call-form" title="Appel simulé">
        <form action={action} className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-13">
            <span>Tâche</span>
            <select
              name="task"
              data-testid="llm-task"
              value={task}
              onChange={(event) => {
                setTask(event.target.value as AiTask);
              }}
              className="rounded-12 border border-solid border-border bg-surface px-3 py-2"
            >
              {TASKS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-13">
            <span>Scénario</span>
            <select
              name="scenario"
              data-testid="llm-scenario"
              defaultValue="demo"
              className="rounded-12 border border-solid border-border bg-surface px-3 py-2"
            >
              {SCENARIOS.map((scenario) => (
                <option key={scenario} value={scenario}>
                  {scenario}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            data-testid="llm-call"
            disabled={pending}
            className="rounded-12 bg-ink px-4 py-2 text-white disabled:opacity-50"
          >
            {pending ? 'Appel…' : 'Appeler'}
          </button>
        </form>
        <p className="mt-4 text-13" data-testid="llm-result">
          {pending
            ? 'Appel en cours…'
            : call === null
              ? state.status === 'done'
                ? 'Scénario inconnu'
                : 'Aucun appel pour l’instant'
              : `${call.kind} · ${call.result}`}
        </p>
        <p className="mt-2 font-mono text-13" data-testid="llm-last-call">
          {pending ? '—' : callLine(call)}
        </p>
      </BaseCard>

      <BaseCard testId="llm-request-preview-card" title="Aperçu du corps de requête Anthropic">
        <pre
          data-testid="llm-request-preview"
          className="overflow-x-auto rounded-12 bg-canvas p-4 text-12"
        >
          {JSON.stringify(previews[task], null, 2)}
        </pre>
        <p className="mt-2 text-12 text-ink-secondary">
          JSON produit par anthropic-options pour la tâche {task}, sans clé.
        </p>
      </BaseCard>
    </>
  );
}
