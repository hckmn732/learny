import Link from 'next/link';

import type { ReviewSummaryDto } from '@learny/contracts';

import { fr } from '../../messages/fr';

const t = fr.globalQuiz;

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function localDay(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).format(instant);
}

function nextDayLabel(instant: Date, forDate: string, timeZone: string): string {
  const day = localDay(instant, timeZone);
  const diff = Math.round(
    (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${forDate}T00:00:00Z`)) / 86_400_000,
  );
  if (diff === 1) return 'demain';
  const weekday = WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()] ?? '';
  const date = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    timeZone,
  }).format(instant);
  return weekday === '' ? date : `${weekday} ${date}`;
}

export interface SessionEndProps {
  summary: ReviewSummaryDto;
  forDate: string;
  timeZone: string;
}

/**
 * SCR-10 §10.6 — end screen of the session (SPEC-701 EF-11): reviewed notions and real duration,
 * the three cards, the next planned slot and the way back home.
 */
export function SessionEnd(props: SessionEndProps) {
  const { summary } = props;
  const next = summary.nextSessionAt === null ? null : new Date(summary.nextSessionAt);
  const nextText =
    next === null
      ? t.end.noNext
      : t.end.next(
          nextDayLabel(next, props.forDate, props.timeZone),
          new Intl.DateTimeFormat('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: props.timeZone,
          }).format(next),
        );

  return (
    <div className="flex flex-col gap-20" data-testid="gq-end">
      <span className="self-start rounded-full bg-lime px-12 py-6 text-12 font-700 tracking-eyebrow text-ink uppercase">
        {t.end.badge}
      </span>
      <h2
        className="m-0 font-display text-34 font-600 tracking-title text-ink"
        data-testid="gq-end-title"
      >
        {t.end.title(summary.reviewedCount, summary.minutes)}
      </h2>
      <div className="grid grid-cols-1 gap-12 shell:grid-cols-3">
        <div className="flex flex-col gap-4 rounded-18 bg-surface-muted p-18">
          <span className="font-display text-30 font-600 text-ink" data-testid="gq-end-ok">
            {summary.okCount}
          </span>
          <span className="text-13 text-ink-muted">{t.end.okLabel}</span>
        </div>
        <div className="flex flex-col gap-4 rounded-18 bg-orange-soft p-18">
          <span className="font-display text-30 font-600 text-orange-ink" data-testid="gq-end-soon">
            {summary.soonCount}
          </span>
          <span className="text-13 text-orange-ink">{t.end.soonLabel}</span>
        </div>
        <div className="flex flex-col gap-4 rounded-18 bg-ink p-18 text-white">
          <span className="font-display text-30 font-600 text-lime" data-testid="gq-end-streak">
            {t.end.streak(summary.streakDays)}
          </span>
          <span className="text-13 text-on-dark-secondary">{t.end.streakLabel}</span>
        </div>
      </div>
      <p className="m-0 text-15 text-ink-muted" data-testid="gq-end-next">
        {nextText}
      </p>
      <Link
        className="inline-flex min-h-48 items-center self-start rounded-14 bg-ink px-20 text-15 font-700 text-white no-underline"
        data-testid="gq-end-home"
        href="/accueil"
      >
        {t.end.home}
      </Link>
    </div>
  );
}
