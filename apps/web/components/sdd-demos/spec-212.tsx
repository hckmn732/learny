'use client';

import { useId, useState, type ReactNode } from 'react';

import type { Highlight, SearchResponse } from '@learny/contracts';

import { ApiError, api } from '../../lib/api-client';
import { fr } from '../../messages/fr';
import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

const t = fr.sdd.spec212;

const buttonClass =
  'rounded-[12px] bg-[#111113] px-4 py-2 text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';
const chipClass =
  'rounded-full border border-solid border-[#E7E6E1] bg-white px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2';

/** EF-6 — cuts `text` at the highlight positions and wraps each match in a `<mark>`. */
function marked(text: string, highlights: Highlight[]): ReactNode {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const range of highlights) {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start));
    parts.push(
      <mark
        key={`${String(range.start)}-${String(range.end)}`}
        className="rounded-[4px] bg-[#FFE58A] px-[1px] text-[#111113]"
      >
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

type State =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'done'; q: string; response: SearchResponse }
  | { phase: 'error'; detail: string };

function Results({ state }: Readonly<{ state: State }>) {
  if (state.phase === 'idle') return <p className="text-sm">{t.results.idle}</p>;
  if (state.phase === 'loading') return <p className="text-sm">{t.results.loading}</p>;
  if (state.phase === 'error') {
    return (
      <p role="alert" data-testid="spec-212-error" className="text-sm font-semibold">
        {t.results.error(state.detail)}
      </p>
    );
  }
  if (state.response.groups.length === 0) {
    return (
      <p data-testid="spec-212-empty" className="text-sm">
        {t.results.empty(state.q)}
      </p>
    );
  }
  return (
    <div className="grid gap-5">
      {state.response.groups.map((group) => (
        <section key={group.kind} data-testid={`spec-212-group-${group.kind}`}>
          <h3 className="font-semibold">
            {group.label}{' '}
            <span data-testid={`spec-212-total-${group.kind}`} className="text-sm font-normal">
              ({t.results.total(group.items.length, group.total)})
            </span>
          </h3>
          <ul className="mt-2 grid gap-3">
            {group.items.map((item) => (
              <li
                key={item.id}
                data-testid="spec-212-item"
                className="rounded-[16px] border border-solid border-[#E7E6E1] p-4"
              >
                <p data-testid="spec-212-item-title" className="font-semibold break-words">
                  {marked(item.title, item.titleHighlights)}
                </p>
                <p data-testid="spec-212-item-snippet" className="mt-1 text-sm break-words">
                  {marked(item.snippet, item.highlights)}
                </p>
                <p className="mt-2 text-xs break-all">
                  {t.results.href} :{' '}
                  <code data-testid="spec-212-item-href" className="font-mono">
                    {item.href}
                  </code>
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function summarize(state: State): string {
  if (state.phase === 'done') {
    const count = state.response.groups.reduce((sum, group) => sum + group.items.length, 0);
    return t.results.summary(count);
  }
  if (state.phase === 'error') return state.detail;
  return '';
}

export default function Spec212Demo() {
  const inputId = useId();
  const [value, setValue] = useState('');
  const [state, setState] = useState<State>({ phase: 'idle' });

  async function run(q: string) {
    setState({ phase: 'loading' });
    try {
      const response = await api.searchGlobal({ query: { q } });
      setState({ phase: 'done', q, response });
    } catch (error) {
      if (error instanceof ApiError) {
        // The API answers the interface message of the violated bound (EF-1).
        setState({ phase: 'error', detail: error.errors?.[0]?.message ?? error.detail });
        return;
      }
      throw error;
    }
  }

  return (
    <>
      <BaseTokenStyle />
      <BaseCard testId="spec-212-query" title={t.query.title}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(value);
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="grid min-w-0 flex-1 gap-1">
            <label htmlFor={inputId} className="text-sm font-semibold">
              {t.query.label}
            </label>
            <input
              id={inputId}
              type="search"
              name="q"
              value={value}
              autoComplete="off"
              onChange={(event) => {
                setValue(event.target.value);
              }}
              className="min-w-0 rounded-[12px] border border-solid border-[#E7E6E1] bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2"
            />
          </div>
          <button type="submit" className={buttonClass} disabled={state.phase === 'loading'}>
            {t.query.submit}
          </button>
        </form>
        <ul aria-label={t.query.examplesLabel} className="mt-4 flex flex-wrap gap-2">
          {t.query.examples.map((example) => (
            <li key={example.q}>
              <button
                type="button"
                className={chipClass}
                data-testid="spec-212-example"
                onClick={() => {
                  setValue(example.q);
                  void run(example.q);
                }}
              >
                {t.query.example(example.q, example.note)}
              </button>
            </li>
          ))}
        </ul>
      </BaseCard>

      <BaseCard testId="spec-212-results" title={t.results.title}>
        <div aria-live="polite" data-testid="spec-212-live">
          <p className="sr-only" data-testid="spec-212-summary">
            {summarize(state)}
          </p>
          <Results state={state} />
        </div>
      </BaseCard>

      <BaseCard testId="spec-212-json" title={t.json.title}>
        <details>
          <summary className="cursor-pointer text-sm font-semibold">{t.json.summary}</summary>
          <pre
            tabIndex={0}
            role="region"
            aria-label={t.json.label}
            data-testid="spec-212-json-body"
            className="mt-3 max-h-[24rem] overflow-auto whitespace-pre-wrap break-all rounded-[12px] bg-[#F4F4F1] p-3 font-mono text-xs"
          >
            {state.phase === 'done' ? JSON.stringify(state.response, null, 2) : t.json.none}
          </pre>
        </details>
      </BaseCard>
    </>
  );
}
