'use client';

import type { SimpleState } from '@learny/contracts';
import { fr } from '@learny/i18n/fr/simple';
import { Button, ProgressBar } from '@learny/ui';

import { CheckIcon, SpinnerIcon } from './icons';
import { analysisProgress } from './simple-mode';

const t = fr.simple.analysis;

function StepMarker({ state }: { state: string }) {
  if (state === 'done') {
    return (
      <span className="flex size-22 shrink-0 items-center justify-center rounded-full bg-lime">
        <CheckIcon />
      </span>
    );
  }
  if (state === 'running') return <SpinnerIcon />;
  return (
    <span
      aria-hidden="true"
      className="size-22 shrink-0 rounded-full border-2 border-solid border-border-strong"
    />
  );
}

export interface AnalysisPanelProps {
  state: SimpleState;
  retrying: boolean;
  onRetry: () => void;
}

/**
 * SPEC-4002 EF-4 (SCR-22, étape 3) — les quatre étapes de l'analyse avec leur détail, la barre de
 * progression et les chapitres trouvés, annoncés poliment pour les lecteurs d'écran.
 */
export function AnalysisPanel({ state, retrying, onRetry }: AnalysisPanelProps) {
  const progress = analysisProgress(state.steps);
  const lastChapter = state.chaptersFound.at(-1);
  const failed = state.status === 'failed';

  return (
    <div className="flex flex-col gap-20" data-testid="simple-analysis">
      <header className="flex flex-col gap-4">
        <h1 className="m-0 font-display text-32 font-600 tracking-title">{t.title}</h1>
        <p className="m-0 text-15 text-ink-muted">{t.hint}</p>
      </header>

      <div className="grid items-start gap-20 lg:grid-cols-2">
        <section
          aria-labelledby="simple-steps-title"
          className="flex flex-col gap-12 rounded-18 border border-solid border-border bg-surface px-22 py-20"
        >
          <h2 className="sr-only" id="simple-steps-title">
            {t.title}
          </h2>
          <ol className="m-0 flex list-none flex-col p-0" data-testid="simple-steps">
            {state.steps.map((step, index) => (
              <li
                className={
                  index === 0
                    ? 'flex items-start gap-12 py-10'
                    : 'flex items-start gap-12 border-t border-solid border-border py-10'
                }
                data-state={step.state}
                data-testid={`simple-step-${step.key}`}
                key={step.key}
              >
                <StepMarker state={step.state} />
                <div className="flex min-w-0 flex-col gap-2">
                  <span className="text-15 font-600">{t.stepLabels[step.key]}</span>
                  <span className="text-13 text-ink-muted">
                    {step.detail ?? t.stepStates[step.state]}
                  </span>
                </div>
              </li>
            ))}
          </ol>
          <ProgressBar label={t.progressLabel} tone="lime" value={progress} />
          {failed ? (
            <div className="flex flex-wrap items-center gap-12" role="alert">
              <p className="m-0 flex-1 text-14 font-600 text-orange-ink">
                {state.error?.message ?? t.failedTitle}
              </p>
              <Button
                data-testid="simple-analysis-retry"
                loading={retrying}
                onClick={onRetry}
                size="md"
                type="button"
                variant="dark"
              >
                {t.retry}
              </Button>
            </div>
          ) : null}
        </section>

        <section
          aria-labelledby="simple-chapters-title"
          className="flex flex-col gap-8 rounded-18 border border-solid border-border bg-surface px-22 py-20"
        >
          <h2
            className="m-0 text-11 font-700 tracking-eyebrow text-ink-muted uppercase"
            id="simple-chapters-title"
          >
            {t.chapters}
          </h2>
          <ol className="m-0 flex list-none flex-col p-0" data-testid="simple-chapters-found">
            {state.chaptersFound.map((chapter) => (
              <li
                className="flex items-center gap-10 py-7 text-14"
                data-testid={`simple-chapter-${String(chapter.position)}`}
                key={chapter.position}
              >
                <span className="w-22 shrink-0 text-ink-muted tabular-nums">
                  {String(chapter.position).padStart(2, '0')}
                </span>
                <span className="flex-1">{chapter.title}</span>
              </li>
            ))}
          </ol>
          {failed || state.status === 'proposed' ? null : (
            <p className="m-0 pt-6 text-13 text-ink-muted">{t.reading}</p>
          )}
        </section>
      </div>

      <p aria-live="polite" className="sr-only" data-testid="simple-analysis-announce">
        {failed
          ? t.announce.failed
          : lastChapter === undefined
            ? ''
            : t.announce.chapters(state.chaptersFound.length, lastChapter.title)}
      </p>
    </div>
  );
}
