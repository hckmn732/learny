'use client';

import type { CourseChapterSummary, CourseSection, ModuleCourseScreen } from '@learny/contracts';

import { fr } from '../../messages/fr';

const t = fr.course;

function chapterHref(screen: ModuleCourseScreen, chapterId: string): string {
  return `/formations/${encodeURIComponent(screen.formation.id)}/modules/${encodeURIComponent(
    screen.module.id,
  )}/cours?chapitre=${encodeURIComponent(chapterId)}`;
}

function sectionLabel(section: CourseSection): string {
  if (section.title !== null && section.title !== '') return section.title;
  if (section.kind === 'retain') return t.takeaway;
  if (section.kind === 'flash_question') return t.quickQuestion.split(' · ')[0] ?? t.quickQuestion;
  if (section.kind === 'summary_prompt') return t.summaryTitle;
  return section.anchor.replaceAll('-', ' ');
}

/** BR-COU-11 — chapter and section table of contents with the persisted chapter progress. */
export function CourseToc({
  screen,
  chapters,
  sections,
}: {
  screen: ModuleCourseScreen;
  chapters: readonly CourseChapterSummary[];
  sections: readonly CourseSection[];
}) {
  return (
    <nav
      aria-label={t.sommaire}
      className="flex flex-1 basis-220 flex-col gap-4 rounded-24 border border-border bg-surface p-14"
      data-testid="course-toc"
    >
      <p className="m-0 px-8 py-8 text-11 font-700 tracking-wide text-ink-muted uppercase">
        {t.sommaire}
      </p>
      {chapters.map((chapter) => {
        const active = chapter.id === screen.selectedChapterId;
        return (
          <div
            className={active ? 'flex flex-col gap-2 rounded-16 bg-surface-muted py-2' : undefined}
            key={chapter.id}
          >
            <a
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'flex min-h-48 items-center gap-10 rounded-14 px-10 py-8 text-14 font-700 text-ink'
                  : 'flex min-h-48 items-center gap-10 rounded-14 px-10 py-8 text-14 text-ink'
              }
              href={chapterHref(screen, chapter.id)}
            >
              <span
                aria-hidden="true"
                className={
                  active
                    ? 'inline-flex h-24 w-24 flex-none items-center justify-center rounded-full bg-ink text-12 text-white'
                    : chapter.percent >= 100
                      ? 'inline-flex h-24 w-24 flex-none items-center justify-center rounded-full bg-lime text-12 text-ink'
                      : 'inline-flex h-24 w-24 flex-none items-center justify-center rounded-full border border-border-strong text-12 text-ink-muted'
                }
              >
                {chapter.percent >= 100 ? '✓' : chapter.position}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span>{chapter.title}</span>
                {active ? (
                  <span className="text-11 font-600 text-ink-muted">
                    {t.tocProgress(chapter.percent)}
                  </span>
                ) : null}
              </span>
            </a>
            {active
              ? sections.map((section) => (
                  <a
                    className="block py-6 pr-10 pl-44 text-13 text-ink-muted"
                    href={`#${section.anchor}`}
                    key={section.id}
                  >
                    {sectionLabel(section)}
                  </a>
                ))
              : null}
          </div>
        );
      })}
    </nav>
  );
}
