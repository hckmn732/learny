// Data of the course screen (SPEC-3302 ET-1, § 9; canevas § 4).
//
// One read - `GET /modules/:mid/course?chapitre=` - under its own key, three mutations the API
// declares idempotent (progress, summary, report) and the controlled read of a citation source.
// Every mutation carries an `Idempotency-Key` forged by the application
// (`src/api/idempotency.ts`): `crypto.randomUUID` does not exist under Hermes, so the key of a route
// `idempotent: true` is always built here and kept until the success (BR-PLA-08, SPEC-3201).
//
// The reading progress is debounced to one send per ten seconds and sent once more when the screen
// is left or the application goes to the background (BR-COU-08); offline, the last snapshot of a
// chapter waits in `pendingProgress` and is replayed when the network returns (CL-1).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type {
  CourseCitationSource,
  CourseProgressUpdate,
  CourseReadingProgress,
  CourseSummaryView,
  ModuleCourseScreen,
} from '@learny/contracts';

import { idempotencyRegistry } from '../api/idempotency';
import { requireApiClient } from '../api/registry';
import { pendingProgress, ReadingTracker } from '../features/cours/progress';
import { clock } from '../lib/clock';
import { useOnlineStatus } from '../offline/network';

import { queryKeys } from './keys';
import type { QueryStatus } from './use-programme';

function statusOf(query: { readonly isError: boolean; readonly data: unknown }): QueryStatus {
  if (query.isError) return 'error';
  return query.data === undefined ? 'loading' : 'ready';
}

/** Milliseconds of the application clock: the debounce follows it, never `Date.now()` (ADR-0047). */
function appMilliseconds(): number {
  return clock.now().getTime();
}

/** Merges an accepted progress into the cached screen, so Programme and the course agree. */
function withProgress(
  screen: ModuleCourseScreen | null,
  progress: CourseReadingProgress,
): ModuleCourseScreen | null {
  if (screen === null || screen.course === null) return screen;
  return { ...screen, course: { ...screen.course, progress } };
}

export interface CourseQuery {
  readonly status: QueryStatus;
  readonly data: ModuleCourseScreen | null;
  readonly retry: () => void;
  readonly refresh: () => Promise<void>;
}

/** Course of one module, selected chapter included (ET-1). */
export function useCourseScreen(moduleId: string | null, chapterId: string | null): CourseQuery {
  const query = useQuery({
    queryKey: queryKeys.course(moduleId ?? 'none', chapterId ?? 'none'),
    queryFn: () =>
      requireApiClient().api.moduleCourse({
        params: { mid: moduleId ?? '' },
        ...(chapterId === null ? {} : { query: { chapitre: chapterId } }),
      }),
    enabled: moduleId !== null,
  });
  return {
    status: moduleId === null ? 'loading' : statusOf(query),
    data: query.data ?? null,
    retry: () => {
      void query.refetch();
    },
    refresh: async () => {
      await query.refetch();
    },
  };
}

export interface CourseProgressHandle {
  /** Percentage shown by the bar: confirmed by the server or estimated from the viewport. */
  readonly chapterPercent: number;
  /** Percentage of the whole course, as the server answered. */
  readonly coursePercent: number;
  /** Records the sections that are visible right now (ET-2). */
  readonly observe: (visibleSectionIds: readonly string[]) => void;
  /** Sends the pending snapshot at once - leaving the screen, background (BR-COU-08). */
  readonly flush: () => void;
}

/**
 * Reading progress of the selected chapter (ET-1, BR-COU-08, CL-1). The hook owns the debounce, the
 * `Idempotency-Key` of each attempt and the offline queue; the screen only reports what it sees.
 */
export function useCourseProgress(screen: ModuleCourseScreen | null): CourseProgressHandle {
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const course = screen?.course ?? null;
  const courseId = course?.id ?? null;
  const chapterId = course?.chapter.id ?? null;
  const moduleId = screen?.module.id ?? null;
  const confirmed = course?.progress.chapterPercent ?? 0;
  const coursePercent = course?.progress.coursePercent ?? 0;
  const sectionCount = course?.sections.length ?? 0;
  const chapterKey = courseId === null || chapterId === null ? null : `${courseId}:${chapterId}`;

  // One measurement per chapter: opening another chapter starts a fresh tracker (ET-1).
  const reader = useMemo(
    () => (chapterKey === null ? null : new ReadingTracker(appMilliseconds, sectionCount)),
    [chapterKey, sectionCount],
  );

  const attempt = useRef(0);
  const mounted = useRef(true);
  const [local, setLocal] = useState<{ readonly key: string | null; readonly percent: number }>({
    key: chapterKey,
    percent: 0,
  });
  const localPercent = local.key === chapterKey ? local.percent : 0;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const send = useCallback(
    (force: boolean): void => {
      if (reader === null || courseId === null || chapterId === null || chapterKey === null) return;
      if (!reader.pending || reader.ids.length === 0) return;
      if (!force && !reader.due()) return;

      const visibleSectionIds = reader.ids;
      if (!online) {
        // CL-1 - queued per chapter, last value wins, replayed when the network returns.
        pendingProgress.enqueue({ courseId, chapterId, visibleSectionIds });
        reader.sent();
        return;
      }

      attempt.current += 1;
      const intent = `course-progress:${chapterKey}#${String(attempt.current)}`;
      const body: CourseProgressUpdate = {
        chapterId,
        visibleSectionIds: [...visibleSectionIds],
      };
      requireApiClient()
        .api.courseProgress(
          { params: { cid: courseId }, body },
          { idempotencyKey: idempotencyRegistry.keyFor(intent) },
        )
        .then((progress) => {
          idempotencyRegistry.resolve(intent);
          reader.sent();
          if (!mounted.current) return;
          setLocal((current) => ({
            key: chapterKey,
            percent: Math.max(
              current.key === chapterKey ? current.percent : 0,
              progress.chapterPercent,
            ),
          }));
          if (moduleId !== null) {
            queryClient.setQueryData<ModuleCourseScreen | undefined>(
              queryKeys.course(moduleId, chapterId),
              (previous) => withProgress(previous ?? null, progress) ?? undefined,
            );
          }
        })
        .catch(() => {
          // Reading is never blocked by the progress write: the snapshot waits for the network.
          pendingProgress.enqueue({ courseId, chapterId, visibleSectionIds });
        });
    },
    [chapterId, chapterKey, courseId, moduleId, online, queryClient, reader],
  );

  const observe = useCallback(
    (visibleSectionIds: readonly string[]): void => {
      if (reader === null || chapterKey === null) return;
      const before = reader.ids.length;
      reader.observe(visibleSectionIds);
      if (reader.ids.length === before) return;
      setLocal((current) => ({
        key: chapterKey,
        percent: Math.max(current.key === chapterKey ? current.percent : 0, reader.percent),
      }));
      if (reader.due()) send(false);
    },
    [chapterKey, reader, send],
  );

  const flush = useCallback((): void => {
    send(true);
  }, [send]);

  // Leaving the screen and going to the background both flush the last snapshot (BR-COU-08).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') send(true);
    });
    return () => {
      subscription.remove();
      send(true);
    };
  }, [send]);

  // Back online: the snapshots queued while offline are replayed, oldest first (CL-1).
  useEffect(() => {
    if (!online) return;
    for (const item of pendingProgress.values()) {
      const intent = `course-progress:queue:${item.courseId}:${item.chapterId}`;
      requireApiClient()
        .api.courseProgress(
          {
            params: { cid: item.courseId },
            body: { chapterId: item.chapterId, visibleSectionIds: [...item.visibleSectionIds] },
          },
          { idempotencyKey: idempotencyRegistry.keyFor(intent) },
        )
        .then(() => {
          idempotencyRegistry.resolve(intent);
          pendingProgress.resolve(item);
        })
        .catch(() => undefined);
    }
  }, [online]);

  return {
    chapterPercent: Math.max(confirmed, localPercent),
    coursePercent,
    observe,
    flush,
  };
}

export interface SummaryHandle {
  readonly submit: (text: string) => Promise<CourseSummaryView>;
  readonly pending: boolean;
}

/** BR-COU-07 - the learner's summary, corrected by the tutor (simulated AI in the campaigns). */
export function useChapterSummary(
  moduleId: string | null,
  courseId: string | null,
  chapterId: string | null,
): SummaryHandle {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (text: string): Promise<CourseSummaryView> => {
      if (courseId === null || chapterId === null) throw new Error('Résumé hors chapitre');
      const intent = `chapter-summary:${chapterId}`;
      const summary = await requireApiClient().api.chapterSummary(
        { params: { cid: chapterId }, body: { courseId, text } },
        { idempotencyKey: idempotencyRegistry.keyFor(intent) },
      );
      idempotencyRegistry.resolve(intent);
      return summary;
    },
    onSuccess: (summary) => {
      if (moduleId === null || chapterId === null) return;
      queryClient.setQueryData<ModuleCourseScreen | undefined>(
        queryKeys.course(moduleId, chapterId),
        (previous) =>
          previous === undefined || previous.course === null
            ? previous
            : { ...previous, course: { ...previous.course, summary } },
      );
    },
  });
  return {
    submit: mutation.mutateAsync,
    pending: mutation.isPending,
  };
}

export interface SectionReportHandle {
  /** Reports a section (BR-COU-09); `true` when the server accepted it. */
  readonly report: (sectionId: string, reason: string) => Promise<boolean>;
  readonly pending: boolean;
}

/** BR-COU-09 - a reported section leaves the new quiz draws until it is corrected. */
export function useSectionReport(
  moduleId: string | null,
  chapterId: string | null,
): SectionReportHandle {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: { sectionId: string; reason: string }): Promise<boolean> => {
      const intent = `course-section-report:${input.sectionId}`;
      try {
        await requireApiClient().api.courseSectionReport(
          { params: { sid: input.sectionId }, body: { reason: input.reason } },
          { idempotencyKey: idempotencyRegistry.keyFor(intent) },
        );
        idempotencyRegistry.resolve(intent);
        return true;
      } catch {
        return false;
      }
    },
    onSuccess: (accepted) => {
      if (!accepted || moduleId === null || chapterId === null) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.course(moduleId, chapterId) });
    },
  });
  return {
    report: (sectionId: string, reason: string) => mutation.mutateAsync({ sectionId, reason }),
    pending: mutation.isPending,
  };
}

export interface CitationSourceHandle {
  /** Resolves the owner's source of a citation (EF-2, CL-4). */
  readonly load: (citationId: string) => Promise<CourseCitationSource>;
  readonly pending: boolean;
  readonly failed: boolean;
  readonly reset: () => void;
}

/** EF-2 - controlled link of a citation; the URL is resolved by the server, never by the client. */
export function useCitationSource(): CitationSourceHandle {
  const mutation = useMutation({
    mutationFn: (citationId: string) =>
      requireApiClient().api.courseCitationSource({ params: { cid: citationId } }),
  });
  return {
    load: mutation.mutateAsync,
    pending: mutation.isPending,
    failed: mutation.isError,
    reset: mutation.reset,
  };
}
