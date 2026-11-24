'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { api } from '@learny/api-client';
import type { AttemptDto } from '@learny/contracts';
import { fr } from '@learny/i18n/fr/simple';
import { Button, ProgressBar } from '@learny/ui';

import { errorMessage } from './simple-mode';

const t = fr.simple.diagnostic;
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

interface ChoicePayload {
  stem: string;
  options: { id: string; text: string }[];
}

function choiceOf(payload: unknown): ChoicePayload | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = payload as { stem?: unknown; options?: unknown };
  if (typeof value.stem !== 'string' || !Array.isArray(value.options)) return null;
  const options = value.options
    .filter(
      (option): option is { id: string; text: string } =>
        typeof option === 'object' &&
        option !== null &&
        typeof (option as { id?: unknown }).id === 'string' &&
        typeof (option as { text?: unknown }).text === 'string',
    )
    .map((option) => ({ id: option.id, text: option.text }));
  return options.length === 0 ? null : { stem: value.stem, options };
}

export interface DiagnosticScreenProps {
  fid: string;
}

/**
 * SPEC-4002 EF-6, ET-4 (SCR-24, étape 5) — le diagnostic global : une à deux questions par module,
 * sans correction question par question, avec « Je ne sais pas » (réponse vide) et « Passer le
 * diagnostic » toujours visible. Le lecteur suit les règles du quiz de SPEC-611 : groupe de radios,
 * flèches du clavier, énoncé annoncé.
 */
export function DiagnosticScreen({ fid }: DiagnosticScreenProps) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<AttemptDto | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goResult = useCallback(
    (attemptId: string | null) => {
      const suffix = attemptId === null ? '' : `?attempt=${attemptId}`;
      router.push(`/formations/${fid}/diagnostic/resultat${suffix}`);
    },
    [fid, router],
  );

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const created = await api.diagnosticCreate(
          { params: { fid } },
          { idempotencyKey: crypto.randomUUID() },
        );
        const loaded = await api.getQuizAttempt({ params: { aid: created.attemptId } });
        if (!controller.signal.aborted) setAttempt(loaded);
      } catch (cause) {
        if (controller.signal.aborted) return;
        const message = errorMessage(cause, fr.simple.errors.generic);
        if (message.includes(t.errors.DIAGNOSTIC_ALREADY_DONE)) {
          goResult(null);
          return;
        }
        setError(message);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [fid, goResult]);

  const questions = attempt?.questions ?? [];
  const question = questions[index];
  const payload = question === undefined ? null : choiceOf(question.payload);

  const answer = useCallback(
    async (optionId: string | null) => {
      if (attempt === null || question === undefined || pending) return;
      setPending(true);
      setError(null);
      try {
        if (optionId !== null) {
          // « Je ne sais pas » n'enregistre rien : la réponse vide est notée fausse à la correction.
          await api.saveQuizAnswer({
            params: { aid: attempt.id, pos: question.position },
            body: { response: { optionIds: [optionId] }, timeMs: 0 },
          });
        }
        if (index + 1 < questions.length) {
          setIndex(index + 1);
          setSelected(null);
          return;
        }
        await api.submitQuizAttempt({ params: { aid: attempt.id } });
        goResult(attempt.id);
      } catch (cause) {
        setError(errorMessage(cause, fr.simple.errors.generic));
      } finally {
        setPending(false);
      }
    },
    [attempt, goResult, index, pending, question, questions.length],
  );

  const skip = useCallback(async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await api.diagnosticSkip({ params: { fid } }, { idempotencyKey: crypto.randomUUID() });
      goResult(null);
    } catch (cause) {
      setError(errorMessage(cause, fr.simple.errors.generic));
    } finally {
      setPending(false);
    }
  }, [fid, goResult, pending]);

  if (error !== null && attempt === null) {
    return (
      <main className="mx-auto w-full max-w-[1160px] px-16 py-24" data-testid="simple-diagnostic">
        <p className="m-0 text-14 font-600 text-orange-ink" role="alert">
          {error}
        </p>
      </main>
    );
  }

  const progress = questions.length === 0 ? 0 : Math.round((index / questions.length) * 100);

  return (
    <main className="mx-auto w-full px-16 pb-40 nav:px-40" data-testid="simple-diagnostic">
      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-18 py-24">
        <div className="flex flex-wrap items-center justify-between gap-12">
          <span className="rounded-full border border-solid border-indigo-soft bg-indigo-soft px-9 py-3 text-12 font-600 text-indigo-ink">
            {t.badge}
          </span>
          <Button
            data-testid="diagnostic-skip"
            disabled={pending}
            onClick={() => void skip()}
            size="md"
            type="button"
            variant="outline"
          >
            {t.skip}
          </Button>
        </div>

        <header className="flex flex-col gap-4">
          <h1 className="m-0 font-display text-30 font-600 tracking-title">{t.title}</h1>
          <p className="m-0 text-15 text-ink-muted">{t.intro}</p>
        </header>

        <section
          aria-labelledby="diagnostic-question-title"
          className="flex max-w-[760px] flex-col rounded-18 border border-solid border-border bg-surface px-28 py-26"
        >
          <div
            className="flex flex-wrap items-center justify-between gap-12 text-13 font-600"
            data-testid="diagnostic-progress"
          >
            <span>{t.progress(index + 1, questions.length)}</span>
            <span className="text-ink-muted">{t.noCorrection}</span>
          </div>
          <div className="mt-10 mb-22">
            <ProgressBar label={t.progress(index + 1, questions.length)} value={progress} />
          </div>

          {question === undefined || payload === null ? (
            <p className="m-0 text-15 text-ink-muted">{t.empty}</p>
          ) : (
            <>
              <p className="m-0 text-12 font-600 text-ink-muted">
                {t.moduleLine(question.notionLabel)}
              </p>
              <h2
                className="mt-8 mb-16 font-display text-24 font-600 leading-1.3"
                id="diagnostic-question-title"
              >
                {payload.stem}
              </h2>
              <div
                aria-labelledby="diagnostic-question-title"
                className="flex flex-col gap-10"
                role="radiogroup"
              >
                {payload.options.map((option, position) => (
                  <button
                    aria-checked={selected === option.id}
                    className={
                      selected === option.id
                        ? 'flex cursor-pointer items-center gap-12 rounded-14 border-2 border-solid border-indigo bg-surface px-16 py-14 text-left text-15 font-600'
                        : 'flex cursor-pointer items-center gap-12 rounded-14 border border-solid border-border-strong bg-surface px-16 py-14 text-left text-15 font-600'
                    }
                    data-testid={`diagnostic-option-${option.id}`}
                    disabled={pending}
                    key={option.id}
                    onClick={() => {
                      setSelected(option.id);
                    }}
                    onKeyDown={(event) => {
                      if (
                        !['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)
                      ) {
                        return;
                      }
                      event.preventDefault();
                      const group = event.currentTarget.closest('[role="radiogroup"]');
                      const buttons = [
                        ...(group?.querySelectorAll<HTMLButtonElement>('button') ?? []),
                      ];
                      const current = buttons.indexOf(event.currentTarget);
                      const delta =
                        event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
                      buttons[(current + delta + buttons.length) % buttons.length]?.focus();
                    }}
                    role="radio"
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className={
                        selected === option.id
                          ? 'inline-flex size-28 shrink-0 items-center justify-center rounded-8 bg-indigo text-13 font-700 text-white'
                          : 'inline-flex size-28 shrink-0 items-center justify-center rounded-8 border border-solid border-border bg-surface-subtle text-13 font-700'
                      }
                    >
                      {LETTERS[position] ?? String(position + 1)}
                    </span>
                    <span className="break-words">{option.text}</span>
                  </button>
                ))}
              </div>
              <div className="mt-20 flex flex-wrap items-center gap-10">
                <Button
                  data-testid="diagnostic-validate"
                  disabled={selected === null}
                  loading={pending}
                  onClick={() => void answer(selected)}
                  size="md"
                  type="button"
                  variant="dark"
                >
                  {t.validate}
                </Button>
                <Button
                  data-testid="diagnostic-dont-know"
                  disabled={pending}
                  onClick={() => void answer(null)}
                  size="md"
                  type="button"
                  variant="outline"
                >
                  {t.dontKnow}
                </Button>
              </div>
            </>
          )}

          {error === null ? null : (
            <p className="m-0 mt-12 text-13 font-600 text-orange-ink" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
