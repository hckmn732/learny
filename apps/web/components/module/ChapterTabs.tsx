'use client';

import Link from 'next/link';

import type { ModuleChapterItem } from '@learny/contracts';
import { cn } from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.module;

export interface ChapterTabsProps {
  formationId: string;
  moduleId: string;
  chapters: readonly ModuleChapterItem[];
  selectedChapterId: string;
}

function chapterHref(formationId: string, moduleId: string, chapterId: string): string {
  return `/formations/${encodeURIComponent(formationId)}/modules/${encodeURIComponent(moduleId)}?chapitre=${encodeURIComponent(chapterId)}`;
}

/**
 * BR-APP-04, BR-NAV-04 — the chapter rail of SCR-06. Each chapter is a real link carrying
 * `aria-current`, so the selection works with Enter and is announced by screen readers. The status
 * is written in words (« Apports terminés » / « En cours ») and not by colour alone.
 */
export function ChapterTabs({
  formationId,
  moduleId,
  chapters,
  selectedChapterId,
}: ChapterTabsProps) {
  return (
    <nav
      aria-label={t.chaptersLabel}
      className="flex flex-1 basis-280 flex-col rounded-24 border border-border bg-surface p-14"
      data-testid="module-chapters"
    >
      {chapters.map((chapter, index) => {
        const selected = chapter.id === selectedChapterId;
        const done = chapter.contributionsStatus === 'done';
        return (
          <Link
            aria-current={selected ? 'step' : undefined}
            className={cn(
              'flex gap-14 rounded-18 px-10 pt-10 text-ink no-underline',
              selected ? 'bg-canvas' : 'bg-transparent',
            )}
            data-chapter-status={chapter.contributionsStatus}
            data-testid={`module-chapter-${String(chapter.position)}`}
            href={chapterHref(formationId, moduleId, chapter.id)}
            key={chapter.id}
          >
            <span className="flex flex-col items-center self-stretch">
              <span
                aria-hidden="true"
                className={cn(
                  'inline-flex h-32 w-32 shrink-0 items-center justify-center rounded-full text-13 font-700',
                  done ? 'bg-lime text-ink' : 'bg-ink text-white',
                )}
              >
                {done ? (
                  <svg
                    fill="none"
                    height="14"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                    viewBox="0 0 24 24"
                    width="14"
                  >
                    <path d="M5 12.5 10 17 19 7" />
                  </svg>
                ) : (
                  chapter.position
                )}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  'mt-4 min-h-16 w-2 flex-1',
                  index === chapters.length - 1 ? 'bg-transparent' : 'bg-border',
                )}
              />
            </span>
            <span className="flex flex-1 flex-col gap-4 pb-14 text-left">
              <span className="text-12 font-600 text-ink-muted">
                {t.chapterEyebrow(chapter.position)}
              </span>
              <span className="text-15 font-700 leading-1.3">{chapter.title}</span>
              <span
                className={cn(
                  'self-start rounded-full px-10 py-3 text-12 font-700',
                  done ? 'bg-green-soft text-green-ink' : 'bg-orange-soft text-orange-ink',
                )}
              >
                {done ? t.chapterStatusDone : t.chapterStatusInProgress}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
