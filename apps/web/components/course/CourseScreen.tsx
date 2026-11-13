'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import type { CourseReadingProgress, ModuleCourseScreen } from '@learny/contracts';

import { api, ApiError } from '../../lib/api-client';
import { fr } from '../../messages/fr';
import { TutorChat } from '../tutor-chat/TutorChat';

import { CourseArticle, type SectionActions } from './CourseArticle';
import { CourseToc } from './CourseToc';
import { SummaryEditor } from './SummaryEditor';

const t = fr.course;

function messageOf(cause: unknown): string {
  return cause instanceof Error && cause.message !== '' ? cause.message : fr.module.errors.generic;
}

export function CourseScreen({ initial }: { initial: ModuleCourseScreen }) {
  const query = useQuery({
    queryKey: ['module-course', initial.module.id, initial.selectedChapterId],
    queryFn: () =>
      api.moduleCourse({
        params: { mid: initial.module.id },
        query: { chapitre: initial.selectedChapterId },
      }),
    initialData: initial,
    refetchInterval: (current) => {
      const data = current.state.data;
      return data?.course === null && data.generation.status === 'generating' ? 3000 : false;
    },
  });
  const screen = query.data;
  const course = screen.course;
  const [liveProgress, setLiveProgress] = useState<CourseReadingProgress | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const displayProgress = liveProgress ??
    course?.progress ?? { chapterPercent: 0, coursePercent: 0, updatedAt: null };
  const visibleRef = useRef<Set<string>>(new Set());
  const reportedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (course === null) return;
    visibleRef.current = new Set();
    reportedRef.current = new Set();
    const sectionIds = course.sections.map((section) => section.id);
    const observer = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = entry.target.getAttribute('data-section-id');
          if (id === null || reportedRef.current.has(id)) continue;
          reportedRef.current.add(id);
          visibleRef.current.add(id);
          changed = true;
        }
        if (!changed) return;
        void api
          .courseProgress(
            {
              params: { cid: course.id },
              body: {
                chapterId: course.chapter.id,
                visibleSectionIds: [...visibleRef.current],
              },
            },
            { idempotencyKey: crypto.randomUUID() },
          )
          .then((progress) => {
            setLiveProgress((current) => ({
              chapterPercent: Math.max(current?.chapterPercent ?? 0, progress.chapterPercent),
              coursePercent: Math.max(current?.coursePercent ?? 0, progress.coursePercent),
              updatedAt: progress.updatedAt ?? current?.updatedAt ?? null,
            }));
          })
          .catch(() => {
            // Reading must never be blocked by a progress write; the next visibility retries.
          });
      },
      { threshold: 0.35 },
    );
    for (const id of sectionIds) {
      const element = document.querySelector(`[data-section-id="${id}"]`);
      if (element !== null) observer.observe(element);
    }
    return () => {
      observer.disconnect();
    };
  }, [course]);

  const actions: SectionActions = {
    onAskPassage: (text, sectionId, label) => {
      window.dispatchEvent(
        new CustomEvent('tutor:ask-passage', { detail: { text, sectionId, label } }),
      );
    },
    onReport: async (sectionId, reason) => {
      try {
        await api.courseSectionReport(
          { params: { sid: sectionId }, body: { reason } },
          { idempotencyKey: crypto.randomUUID() },
        );
        await query.refetch();
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },
    onEdit: async (sectionId, expectedVersion, contentMd) => {
      try {
        await api.courseSectionEdit(
          { params: { sid: sectionId }, body: { expectedVersion, contentMd } },
          { idempotencyKey: crypto.randomUUID() },
        );
        await query.refetch();
        return { ok: true };
      } catch (error) {
        return { ok: false, conflict: error instanceof ApiError && error.code === 'CONFLICT' };
      }
    },
  };

  return (
    <main
      className={`mx-auto w-full px-16 pb-40 shell:px-40 ${chatOpen ? 'min-[1200px]:pr-[500px]' : ''}`}
      data-chat-open={chatOpen ? 'true' : undefined}
      data-testid="course-page"
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-20">
        <div className="flex flex-wrap items-center justify-between gap-12">
          <nav aria-label="Fil d’Ariane" className="text-14 text-ink-muted">
            <a
              className="underline"
              href={`/formations/${encodeURIComponent(screen.formation.id)}/programme`}
            >
              Programme
            </a>{' '}
            /{' '}
            <a
              className="underline"
              href={`/formations/${encodeURIComponent(screen.formation.id)}/modules/${encodeURIComponent(screen.module.id)}`}
            >
              Module {screen.module.position} · {screen.module.title}
            </a>{' '}
            / {t.breadcrumbCours}
          </nav>
          {course === null ? null : (
            <div className="flex min-w-240 items-center gap-10">
              <div
                aria-label={t.chapterProgress(displayProgress.chapterPercent)}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={displayProgress.chapterPercent}
                className="h-6 flex-1 rounded-3 bg-border"
                data-testid="course-progress"
                role="progressbar"
              >
                <div
                  className="h-6 rounded-3 bg-ink"
                  style={{ width: `${String(displayProgress.chapterPercent)}%` }}
                />
              </div>
              <span className="text-13 font-600">
                {t.progressLabel(displayProgress.chapterPercent)}
              </span>
            </div>
          )}
        </div>

        {course === null ? (
          <section
            className="flex flex-col gap-12 rounded-24 border border-border bg-surface p-28"
            data-testid="course-state"
          >
            <h1 className="m-0 font-display text-30 font-600 tracking-title">
              {screen.generation.status === 'generating'
                ? t.loadingTitle
                : screen.generation.status === 'failed'
                  ? t.failedTitle
                  : t.emptyTitle}
            </h1>
            <p className="m-0 text-15 text-ink-muted" role="status">
              {screen.generation.status === 'generating'
                ? t.loadingText
                : screen.generation.status === 'failed'
                  ? (screen.generation.error ?? t.failedText)
                  : t.emptyText}
            </p>
            {screen.generation.status === 'failed' ? (
              <p className="m-0 text-14 text-ink-muted">{t.failedText}</p>
            ) : null}
          </section>
        ) : (
          <div className="flex flex-wrap items-start gap-20">
            <CourseToc chapters={screen.chapters} screen={screen} sections={course.sections} />

            <article
              className="flex min-w-0 flex-1 basis-560 flex-col gap-20 rounded-28 border border-border bg-surface p-28 shell:p-40"
              data-cours="true"
              data-testid="course-article"
            >
              <div className="flex flex-col gap-14" data-testid="course-header">
                <div className="flex flex-wrap gap-8 text-12 font-700">
                  <span className="rounded-full bg-ink px-10 py-5 text-white">
                    {t.chapterBadge(course.chapter.position, screen.chapters.length)}
                  </span>
                  <span className="rounded-full bg-surface-muted px-10 py-5">
                    {course.readingMinutes} min {t.reading}
                  </span>
                  <span className="rounded-full bg-surface-muted px-10 py-5">
                    {course.baseCourse ? t.baseCourse : t.builtFrom(course.resourceCount)}
                  </span>
                </div>
                <h1
                  className="m-0 font-display text-34 font-600 tracking-title shell:text-40"
                  data-testid="course-title"
                >
                  {course.chapter.title}
                </h1>
                {course.baseCourse ? (
                  <div
                    className="flex flex-col gap-6 rounded-16 bg-orange-soft p-14 text-14 text-orange-ink-strong"
                    data-testid="course-base-notice"
                  >
                    <strong>{t.baseCourseTitle}</strong>
                    <span>{t.baseCourseText}</span>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-20">
                {course.sections.map((section) => (
                  <div data-section-id={section.id} key={section.id}>
                    <CourseArticle actions={actions} sections={[section]} />
                  </div>
                ))}
              </div>

              {course.sections.some((section) => section.kind === 'summary_prompt') ? (
                <SummaryEditor
                  chapterId={course.chapter.id}
                  courseId={course.id}
                  initial={course.summary}
                  onSaved={() => {
                    void query.refetch();
                  }}
                />
              ) : null}

              {course.baseCourse ? (
                <section
                  className="flex flex-col gap-8 rounded-20 border border-border bg-surface-muted p-18"
                  data-testid="course-suggestions"
                >
                  <h2 className="m-0 font-display text-20 font-600">{t.suggestionsTitle}</h2>
                  <p className="m-0 text-14 text-ink-muted">{t.suggestionsIntro}</p>
                  <ul className="m-0 flex list-none flex-col gap-8 p-0">
                    {course.suggestions.map((suggestion) => (
                      <li className="rounded-14 bg-surface p-12" key={suggestion.id}>
                        <a className="text-14 font-700 underline" href={suggestion.url}>
                          {suggestion.title}
                        </a>
                        <p className="m-0 mt-4 text-13 text-ink-muted">{suggestion.reason}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <div className="flex flex-wrap justify-between gap-12 border-t border-border pt-16">
                {course.previousChapterId === null ? (
                  <span />
                ) : (
                  <a
                    className="inline-flex min-h-48 items-center rounded-14 border border-border-strong bg-surface px-18 text-14 font-600"
                    href={`/formations/${encodeURIComponent(screen.formation.id)}/modules/${encodeURIComponent(screen.module.id)}/cours?chapitre=${encodeURIComponent(course.previousChapterId)}`}
                  >
                    {t.previous}
                  </a>
                )}
                {course.nextChapterId === null ? null : (
                  <a
                    className="inline-flex min-h-48 items-center rounded-14 bg-ink px-18 text-14 font-700 text-white"
                    href={`/formations/${encodeURIComponent(screen.formation.id)}/modules/${encodeURIComponent(screen.module.id)}/cours?chapitre=${encodeURIComponent(course.nextChapterId)}`}
                  >
                    {t.next}
                  </a>
                )}
              </div>
            </article>

            <aside
              aria-label="Tuteur et quiz"
              className="flex flex-1 basis-260 flex-col gap-16"
              data-testid="course-tutor-aside"
            >
              <TutorChat
                chapterPosition={course.chapter.position}
                chapterTitle={course.chapter.title}
                course={course}
                formationTitle={screen.formation.title}
                onOpenChange={setChatOpen}
              />
              <section
                aria-labelledby="t-quiz"
                className="flex flex-col gap-10 rounded-24 bg-lime p-22 text-ink"
                data-testid="course-quiz-card"
              >
                <h2 className="m-0 font-display text-22 font-600" id="t-quiz">
                  {t.quizTitle}
                </h2>
                <p className="m-0 text-14 leading-1.5">
                  {t.quizText.replace('{threshold}', String(course.quiz.threshold))}
                </p>
                <a
                  className="inline-flex min-h-44 w-fit items-center rounded-12 bg-ink px-18 text-14 font-700 text-white"
                  data-testid="course-quiz-link"
                  href={course.quiz.href}
                >
                  {t.quizAction}
                </a>
              </section>
            </aside>
          </div>
        )}
        {query.error === null ? null : (
          <p
            className="m-0 rounded-14 bg-orange-soft p-12 text-14 text-orange-ink-strong"
            role="alert"
          >
            {messageOf(query.error)}
          </p>
        )}
      </div>
    </main>
  );
}
