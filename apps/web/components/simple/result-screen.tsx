'use client';

import { useCallback, useEffect, useState } from 'react';

import { api } from '@learny/api-client';
import type { ProgrammeProposalStateDto, QuizResultDto, SimpleState } from '@learny/contracts';
import { fr } from '@learny/i18n/fr/simple';
import { Button } from '@learny/ui';
import { colors } from '@learny/ui/tokens';

import { formatLongDate } from '../programme/dates';

import { CheckIcon, QuoteIcon, SpinnerIcon } from './icons';
import {
  errorMessage,
  formatHours,
  proposalEndDate,
  readyChapter,
  type ReadyChapter,
} from './simple-mode';

const t = fr.simple.result;
/** EF-7 — la préparation des modules suivants se rafraîchit toutes les cinq secondes. */
const GENERATION_POLL_MS = 5000;

export interface ResultScreenProps {
  fid: string;
  state: SimpleState;
  programme: ProgrammeProposalStateDto;
  /** Tentative du diagnostic, absente quand l'apprenant l'a passé (aucune ligne de score, EF-7). */
  attemptId: string | null;
}

/**
 * SPEC-4002 EF-7 (SCR-24, étape 6) — le résultat du diagnostic, le premier chapitre prêt et la
 * préparation des modules suivants, interrogée toutes les cinq secondes (EF-12 de SPEC-4001).
 */
export function ResultScreen({ fid, state, programme, attemptId }: ResultScreenProps) {
  const [result, setResult] = useState<QuizResultDto | null>(null);
  const [total, setTotal] = useState(0);
  const [generation, setGeneration] = useState(state.generation ?? []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (attemptId === null) return undefined;
    const controller = new AbortController();
    void (async () => {
      try {
        const [loaded, attempt] = await Promise.all([
          api.getQuizResult({ params: { aid: attemptId } }),
          api.getQuizAttempt({ params: { aid: attemptId } }),
        ]);
        if (controller.signal.aborted) return;
        setResult(loaded);
        setTotal(attempt.total);
      } catch (cause) {
        if (!controller.signal.aborted) setError(errorMessage(cause, fr.simple.errors.generic));
      }
    })();
    return () => {
      controller.abort();
    };
  }, [attemptId]);

  const pollGeneration = useCallback(async () => {
    try {
      const next = await api.simpleGet({ params: { fid } });
      setGeneration(next.generation ?? []);
    } catch {
      // Une interrogation manquée n'efface pas la liste déjà affichée.
    }
  }, [fid]);

  useEffect(() => {
    if (!generation.some((entry) => entry.state === 'generating' || entry.state === 'queued')) {
      return undefined;
    }
    const timer = window.setInterval(() => void pollGeneration(), GENERATION_POLL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [generation, pollGeneration]);

  const proposal = programme.proposal;
  const modules = proposal?.modules ?? [];
  const volumeHours = proposal?.volumeHours ?? null;
  const acquired = result?.acquiredModuleIds ?? [];
  const correct =
    result === null || result.score === null ? 0 : Math.round((result.score * total) / 100);
  const ready: ReadyChapter | null = readyChapter(generation, modules, volumeHours);
  const remainingModules = Math.max(0, modules.length - acquired.length);
  const remainingHours =
    modules.length === 0
      ? '—'
      : formatHours(((volumeHours ?? 0) * 60 * remainingModules) / modules.length);
  const endDate = proposalEndDate(modules);

  return (
    <main className="mx-auto w-full px-16 pb-40 nav:px-40" data-testid="simple-result">
      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-18 py-24">
        {attemptId === null || result === null ? null : (
          <span className="self-start rounded-full border border-solid border-green-soft bg-green-soft px-9 py-3 text-12 font-600 text-green-ink">
            <span className="mr-6 inline-flex">
              <CheckIcon color={colors['green-ink']} />
            </span>
            <span data-testid="simple-result-score">{t.score(correct, total)}</span>
          </span>
        )}
        {attemptId === null ? (
          <span className="self-start rounded-full border border-solid border-border bg-surface-subtle px-9 py-3 text-12 font-600 text-ink-muted">
            {t.skipped}
          </span>
        ) : null}

        <header className="flex flex-col gap-4">
          <h1
            className="m-0 font-display text-32 font-600 tracking-title"
            data-testid="simple-result-title"
          >
            {acquired.length === 0 ? t.none : t.acquired(acquired.length)}
          </h1>
          <p className="m-0 text-15 text-ink-muted">
            {t.remaining(
              remainingModules,
              remainingHours,
              endDate === null ? '—' : formatLongDate(endDate),
            )}
          </p>
        </header>

        <div className="grid items-start gap-20 lg:grid-cols-[1.2fr_1fr]">
          <section
            className="flex flex-col gap-10 rounded-22 bg-ink px-26 py-24 text-white"
            data-testid="simple-ready-card"
          >
            <p className="m-0 text-11 font-700 tracking-eyebrow text-lime uppercase">{t.ready}</p>
            {ready === null ? (
              <p className="m-0 text-15 text-on-dark-muted">{t.generation}</p>
            ) : (
              <>
                <h2 className="m-0 font-display text-28 font-600">{ready.module.title}</h2>
                <p className="m-0 text-15 text-on-dark-secondary">
                  {t.readyMeta(ready.module.position, ready.chapterPosition, ready.chapterTitle)}
                </p>
                <div className="mt-12 flex flex-wrap items-center gap-8">
                  <span className="rounded-full border border-solid border-dark-600 bg-dark-750 px-9 py-3 text-12 font-600 text-on-dark-faint">
                    {t.course(ready.courseMinutes)}
                  </span>
                  <span className="rounded-full border border-solid border-dark-600 bg-dark-750 px-9 py-3 text-12 font-600 text-on-dark-faint">
                    {t.exercises(ready.exercises)}
                  </span>
                  {ready.pages === null ? null : (
                    <span className="inline-flex items-center gap-6 rounded-full border border-solid border-dark-600 bg-dark-750 px-9 py-3 text-12 font-600 text-on-dark-faint">
                      <QuoteIcon color={colors['on-dark-faint']} />
                      {t.pages(ready.pages.from, ready.pages.to)}
                    </span>
                  )}
                </div>
                <div className="mt-20 flex flex-wrap items-center gap-10">
                  <Button asChild size="lg" variant="lime">
                    <a
                      data-testid="simple-result-start"
                      href={`/formations/${fid}/modules/${ready.module.moduleId}/cours`}
                    >
                      {t.start(ready.courseMinutes)}
                    </a>
                  </Button>
                  <Button asChild size="lg" variant="outline-on-dark">
                    <a href={`/formations/${fid}/programme`}>{t.programme}</a>
                  </Button>
                </div>
              </>
            )}
          </section>

          <section
            aria-labelledby="simple-generation-title"
            className="flex flex-col gap-6 rounded-18 border border-solid border-border bg-surface px-20 py-18"
          >
            <h2
              className="m-0 text-11 font-700 tracking-eyebrow text-ink-muted uppercase"
              id="simple-generation-title"
            >
              {t.generation}
            </h2>
            <ul className="m-0 flex list-none flex-col p-0" data-testid="simple-generation">
              {generation.map((entry, index) => (
                <li
                  className={
                    index === 0
                      ? 'flex items-center gap-12 py-10'
                      : 'flex items-center gap-12 border-t border-solid border-border py-10'
                  }
                  data-state={entry.state}
                  data-testid={`simple-generation-module-${String(entry.position)}`}
                  key={entry.moduleId}
                >
                  {entry.state === 'generating' ? (
                    <SpinnerIcon />
                  ) : (
                    <span
                      className={
                        entry.state === 'acquired'
                          ? 'flex size-22 shrink-0 items-center justify-center rounded-full bg-green-soft'
                          : entry.state === 'ready'
                            ? 'flex size-22 shrink-0 items-center justify-center rounded-full bg-lime'
                            : 'size-22 shrink-0 rounded-full border-2 border-solid border-border-strong'
                      }
                    >
                      {entry.state === 'acquired' ? (
                        <CheckIcon color={colors['green-ink']} />
                      ) : entry.state === 'ready' ? (
                        <CheckIcon color={colors.ink} />
                      ) : null}
                    </span>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="text-14 font-600">
                      {t.generationModule(entry.position, entry.title)}
                    </span>
                    {entry.state === 'generating' || entry.state === 'queued' ? (
                      <span className="text-12 text-ink-muted">
                        {t.generationStates[entry.state]}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            <p className="m-0 mt-4 flex gap-6 text-12 leading-1.5 text-ink-muted">
              <span className="mt-2 shrink-0">
                <QuoteIcon />
              </span>
              {t.citationNote}
            </p>
          </section>
        </div>

        {error === null ? null : (
          <p className="m-0 text-13 font-600 text-orange-ink" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
