import NextLink from 'next/link';

import type { GapCard as GapCardDto, GapNature } from '@learny/contracts';
import { ProgressBar } from '@learny/ui';

import { fr } from '../../messages/fr';

import { formatDetectedAt, formatPercent } from './format';

const t = fr.gaps.card;

const NATURE_STYLE: Record<GapNature, string> = {
  confusion: 'bg-orange-soft text-orange-ink',
  misunderstanding: 'bg-violet-soft text-violet-ink',
  application: 'bg-green-soft text-green-ink',
  forgetting: 'bg-indigo-soft text-indigo-ink-strong',
};

const NATURE_LABEL: Record<GapNature, string> = {
  forgetting: fr.gaps.filters.forgetting,
  confusion: fr.gaps.filters.confusion,
  misunderstanding: fr.gaps.filters.misunderstanding,
  application: fr.gaps.filters.application,
};

function lowerFirst(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toLocaleLowerCase('fr-FR') + value.slice(1);
}

function recommendation(item: GapCardDto): string {
  const other = item.confusedWithLabel ?? 'une autre notion';
  switch (item.recommendedAction) {
    case 'global_quiz':
      return t.recommendations.global_quiz;
    case 'confrontation':
      return t.recommendations.confrontation(lowerFirst(item.notionLabel), other);
    case 'alternative_explanation':
      return t.recommendations.alternative_explanation;
    case 'practice_exercise':
      return t.recommendations.practice_exercise;
  }
}

export interface GapCardProps {
  item: GapCardDto;
  timezone: string;
}

/**
 * One gap card of SCR-13 (EF-2, EF-3, ET-4, ET-5; BR-LAC-05): nature, module and chapter, notion,
 * what revealed it, the tutor remediation, mastery and threshold, then the two actions. The course
 * action is a disabled control when no live section anchors the notion, never a broken `#anchor`.
 */
export function GapCard({ item, timezone }: GapCardProps) {
  const mastery = formatPercent(item.mastery);
  const revealedBy =
    item.revealedBy.trim() === ''
      ? t.revealedFallback(formatDetectedAt(item.detectedAt, timezone))
      : item.revealedBy;
  return (
    <li
      data-testid="gap-card"
      data-nature={item.nature}
      data-notion-id={item.notionId}
      className="flex flex-wrap items-start gap-20 rounded-24 border border-solid border-border bg-surface p-22 shell:gap-28 shell:px-24"
    >
      <div className="flex min-w-0 flex-[2_1_380px] flex-col gap-10">
        <div className="flex flex-wrap items-center gap-8">
          <span className={`rounded-full px-10 py-4 text-12 font-700 ${NATURE_STYLE[item.nature]}`}>
            {NATURE_LABEL[item.nature]}
          </span>
          <span className="rounded-full bg-canvas px-10 py-4 text-12 font-600 text-ink-secondary">
            Module {item.modulePosition} · {item.moduleTitle}
          </span>
          <span className="rounded-full bg-canvas px-10 py-4 text-12 font-500 text-ink-muted">
            {item.chapterTitle}
          </span>
        </div>
        <h2 className="m-0 text-22 font-600 font-display tracking-heading">{item.notionLabel}</h2>
        <p className="m-0 text-15 leading-1.5 text-ink-secondary">
          <strong>{t.revealedBy}</strong> {revealedBy}
        </p>
        <p className="m-0 rounded-14 bg-canvas px-14 py-12 text-14 leading-1.5 text-ink">
          <strong>{t.tutorProposes}</strong> {recommendation(item)}
        </p>
      </div>
      <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-12">
        <div className="flex flex-col gap-6">
          <div className="flex justify-between gap-8 text-13">
            <span className="text-ink-muted">{t.mastery}</span>
            <span className="font-700 tabular-nums">{mastery} %</span>
          </div>
          <ProgressBar
            value={item.mastery}
            tone="orange"
            size="md"
            label={t.masteryLabel(item.notionLabel, mastery)}
          />
          <span className="text-12 text-ink-muted">{t.threshold(item.threshold)}</span>
        </div>
        <div className="flex flex-wrap gap-8">
          <NextLink
            data-testid="gap-train"
            href={item.training.href}
            prefetch={false}
            aria-label={`${t.train} : ${item.notionLabel}`}
            className="inline-flex min-h-44 items-center rounded-12 bg-ink px-16 text-14 font-700 text-white no-underline transition-colors hover:bg-dark-700"
          >
            {t.train}
          </NextLink>
          {item.course === null ? (
            <span
              data-testid="gap-course-link"
              aria-disabled="true"
              title={t.courseUnavailableHint}
              className="inline-flex min-h-44 cursor-not-allowed items-center rounded-12 border border-solid border-border-strong bg-surface px-16 text-14 font-600 text-ink-muted opacity-55"
            >
              {t.courseUnavailable}
            </span>
          ) : (
            <NextLink
              data-testid="gap-course-link"
              href={item.course.href}
              prefetch={false}
              aria-label={`${t.course} : ${item.notionLabel}`}
              className="inline-flex min-h-44 items-center rounded-12 border border-solid border-border-strong bg-surface px-16 text-14 font-600 text-ink no-underline transition-colors hover:border-ink"
            >
              {t.course}
            </NextLink>
          )}
        </div>
      </div>
    </li>
  );
}
