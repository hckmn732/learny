// Target of the tutor sheet (SPEC-3303 EF-1, EF-2, BR-TUT-01).
//
// The route accepts `courseId`, `chapterId` and `sectionId`. When the entry point is a passage of
// the course (SPEC-3302), the two identifiers are given; opened from anywhere else — the
// « Demander au tuteur » entry, a deep link, the QA flows — they are resolved from the learner's
// current formation: the open module, then the course of that module. The subtitle of the header
// (« Comptabilité générale · chapitre 2 ») comes from the same read, never from a constant.
import { useQuery } from '@tanstack/react-query';

import { isActiveProgramme } from '@learny/contracts';

import { requireApiClient } from '../../api/registry';
import { queryKeys } from '../../data/keys';

export interface TutorTarget {
  readonly status: 'loading' | 'ready' | 'error';
  /** Identifier of the course the discussion belongs to (`courses.id`), `null` while unknown. */
  readonly courseId: string | null;
  readonly chapterId: string | null;
  /** Chapter subtitle of the header: « Comptabilité générale · chapitre 2 ». */
  readonly subtitle: string | null;
  readonly retry: () => void;
}

export interface TutorTargetParams {
  readonly courseId?: string | undefined;
  readonly chapterId?: string | undefined;
}

/** Resolves the course and chapter of the sheet, from the route or from the current programme. */
export function useTutorTarget(params: TutorTargetParams): TutorTarget {
  const me = useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => requireApiClient().api.meGet({}),
  });
  const sidebar = useQuery({
    queryKey: queryKeys.sidebar(),
    queryFn: () => requireApiClient().api.sidebarGet({}),
  });

  const formationId =
    me.data?.currentFormationId ??
    sidebar.data?.currentFormation?.id ??
    sidebar.data?.formations.find((formation) => formation.status === 'active')?.id ??
    null;

  const programme = useQuery({
    queryKey: queryKeys.programme(formationId ?? 'none'),
    queryFn: () => requireApiClient().api.programmeGet({ params: { fid: formationId ?? '' } }),
    enabled: formationId !== null,
  });

  const openModule =
    programme.data !== undefined && isActiveProgramme(programme.data)
      ? (programme.data.modules.find((module) => module.status === 'open') ?? null)
      : null;

  const moduleCourse = useQuery({
    queryKey: queryKeys.moduleCourse(openModule?.id ?? 'none'),
    queryFn: () => requireApiClient().api.moduleCourse({ params: { mid: openModule?.id ?? '' } }),
    enabled: openModule !== null,
  });

  const resolvedCourseId = params.courseId ?? moduleCourse.data?.course?.id ?? null;
  const resolvedChapterId = params.chapterId ?? moduleCourse.data?.course?.chapter.id ?? null;

  const chapter = moduleCourse.data?.course?.chapter ?? null;
  const moduleTitle = moduleCourse.data?.module.title ?? openModule?.title ?? null;
  const subtitle =
    moduleTitle === null
      ? null
      : chapter === null
        ? moduleTitle
        : `${moduleTitle} · chapitre ${String(chapter.position)}`;

  const failed = me.isError || programme.isError || moduleCourse.isError;

  return {
    status:
      resolvedCourseId !== null && resolvedChapterId !== null
        ? 'ready'
        : failed
          ? 'error'
          : 'loading',
    courseId: resolvedCourseId,
    chapterId: resolvedChapterId,
    subtitle,
    retry: () => {
      void me.refetch();
      void sidebar.refetch();
      void programme.refetch();
      void moduleCourse.refetch();
    },
  };
}
