'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ExamIntroDto } from '@learny/contracts';

import { api, ApiError } from '../../lib/api-client';
import { fr } from '../../messages/fr';

const t = fr.mockExam;

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function contiguousRange(positions: readonly number[]): { from: number; to: number } | null {
  if (positions.length === 0) return null;
  const sorted = [...positions].sort((left, right) => left - right);
  const from = sorted[0] ?? 0;
  const to = sorted.at(-1) ?? from;
  return to - from + 1 === sorted.length ? { from, to } : { from, to };
}

export interface ExamIntroProps {
  intro: ExamIntroDto;
  programmeHref: string;
}

/** SPEC-614 EF-1, EF-5 — introduction, format confirmation and launch (SCR-11). */
export function ExamIntro({ intro, programmeHref }: ExamIntroProps) {
  const router = useRouter();
  const [format, setFormat] = useState(intro.format);
  const [busy, setBusy] = useState<'confirm' | 'start' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const diagnostic = contiguousRange(intro.diagnosticModules.map((module) => module.position));
  const dates = intro.nextExams.map((exam) => shortDate(exam.startsAt)).join(' et ');

  const confirm = async () => {
    setBusy('confirm');
    setError(null);
    try {
      const confirmed = await api.confirmExamFormatRoute({
        params: { fid: intro.formationId },
        body: { confirmed: true },
      });
      setFormat(confirmed);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.detail : t.errorTitle);
    } finally {
      setBusy(null);
    }
  };

  const start = async () => {
    setBusy('start');
    setError(null);
    try {
      const started = await api.startExamAttempt({ params: { fid: intro.formationId } });
      router.push(
        `/formations/${encodeURIComponent(intro.formationId)}/examen-blanc/${encodeURIComponent(started.attemptId)}`,
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.detail : t.errorTitle);
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto w-full px-16 pb-40 shell:px-40">
      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-22" data-testid="exam-intro">
        <header className="flex flex-col gap-8">
          <nav aria-label="Fil d'Ariane" className="text-14 text-ink-muted">
            <a className="underline" href={programmeHref}>
              Programme
            </a>{' '}
            / {t.breadcrumb}
          </nav>
          <p className="m-0 text-14 text-ink-muted">{t.subtitle(intro.title)}</p>
          <h1 className="m-0 font-display text-34 font-600 tracking-title">{t.title}</h1>
        </header>

        <div className="flex flex-wrap gap-12">
          <section className="flex flex-1 basis-200 flex-col gap-4 rounded-22 bg-ink p-20 text-white">
            <span
              className="font-display text-34 font-600 text-lime"
              data-testid="exam-format-questions"
            >
              {format.questionCount}
            </span>
            <span className="text-13 text-on-dark-secondary">{t.questionsLabel}</span>
          </section>
          <section className="flex flex-1 basis-200 flex-col gap-4 rounded-22 border border-border bg-surface p-20">
            <span className="font-display text-34 font-600" data-testid="exam-format-duration">
              {t.durationLabel(format.durationMin)}
            </span>
            <span className="text-13 text-ink-muted">{t.timedLabel}</span>
          </section>
          <section className="flex flex-1 basis-200 flex-col gap-4 rounded-22 border border-border bg-surface p-20">
            <span className="font-display text-34 font-600" data-testid="exam-format-threshold">
              {t.thresholdLabel(format.threshold)}
            </span>
            <span className="text-13 text-ink-muted">{t.passLabel}</span>
          </section>
        </div>

        <p
          className="m-0 rounded-16 bg-indigo-soft px-16 py-12 text-14 leading-1.5 text-indigo-ink-strong"
          data-testid="exam-format-banner"
        >
          {intro.hasGuide ? (
            <>
              <strong>Format officiel :</strong> {format.confirmed ? null : `${t.formatPending} `}
              {t.formatGuide}
            </>
          ) : (
            t.formatDefault
          )}
        </p>

        <div className="flex flex-wrap items-start gap-20">
          <section
            aria-labelledby="t-exam-rules"
            className="flex flex-2 basis-420 flex-col gap-12 rounded-24 border border-border bg-surface p-22"
          >
            <h2 className="m-0 text-18 font-600" id="t-exam-rules">
              {t.rulesTitle}
            </h2>
            <ul className="m-0 flex list-disc flex-col gap-8 pl-20 text-15 leading-1.5 text-ink-secondary">
              {t.rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </section>
          <section
            aria-labelledby="t-exam-diagnostic"
            className="flex flex-1 basis-280 flex-col gap-10 rounded-24 border border-border bg-surface p-22"
          >
            <h2 className="m-0 text-18 font-600" id="t-exam-diagnostic">
              {t.diagnosticTitle}
            </h2>
            <p className="m-0 text-14 leading-1.55 text-ink-secondary">
              {diagnostic === null
                ? t.noDiagnostic
                : t.diagnosticLine(diagnostic.from, diagnostic.to, intro.diagnosticQuestionCount)}
            </p>
            <p className="m-0 text-13 text-ink-muted" data-testid="exam-next-exams">
              {intro.nextExams.length === 0 ? t.noNextExams : t.nextExams(dates)}
            </p>
          </section>
        </div>

        {error === null ? null : (
          <p className="m-0 rounded-14 bg-orange-soft p-12 text-14 text-orange-ink" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-10">
          {format.confirmed ? null : (
            <button
              className="min-h-52 rounded-16 border border-border-strong bg-surface px-24 text-16 font-700 text-ink disabled:opacity-60"
              data-testid="exam-confirm-format"
              disabled={busy !== null}
              onClick={() => {
                void confirm();
              }}
              type="button"
            >
              {busy === 'confirm' ? t.confirmingFormat : t.confirmFormat}
            </button>
          )}
          <button
            className="min-h-52 rounded-16 bg-lime px-24 text-16 font-700 text-ink disabled:opacity-60"
            data-testid="exam-start"
            disabled={!format.confirmed || busy !== null}
            onClick={() => {
              void start();
            }}
            type="button"
          >
            {busy === 'start' ? t.starting : t.start}
          </button>
        </div>
      </div>
    </main>
  );
}
