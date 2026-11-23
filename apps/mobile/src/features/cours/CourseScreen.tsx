// Course screen (SPEC-3302 EF-1 to EF-7; SCR-07, ADR-3002 § 3, ADR-3003, ADR-3010).
//
// One chapter of the course of a module: the « Chapitre 2 sur 4 » header with its reading bar, the
// article rendered section by section (Markdown of SPEC-3301, « Question éclair », « Ne pas
// confondre », « À retenir »), the summary of the end of chapter, the neighbours and the two actions
// of the bottom bar. Every value comes from the API; the reading progress is measured from the
// viewport and sent to the server (BR-COU-08).
//
// The screen is deliberately free of a router: the route `app/cours/[courseId].tsx` supplies the
// navigation (back, neighbour chapter) and the web hand-offs of the two destinations that later
// specifications deliver - the tutor sheet (SPEC-3303) and the validation quiz (SPEC-3304).
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type {
  CourseCitation,
  CourseSection as CourseSectionDto,
  ModuleCourseScreen,
} from '@learny/contracts';
import { fr } from '@learny/i18n';

import {
  useChapterSummary,
  useCourseProgress,
  useCourseScreen,
  useSectionReport,
} from '../../data/course';
import { useMe } from '../../data/use-programme';
import { userTimeZone } from '../../lib/dates';
import { useOnlineStatus } from '../../offline/network';
import { radius, theme } from '../../theme';
import { Banner } from '../../ui/Banner';
import { EmptyState } from '../../ui/EmptyState';
import { ErrorState } from '../../ui/ErrorState';
import { Icon } from '../../ui/Icon';
import { Skeleton } from '../../ui/Skeleton';
import { Text } from '../../ui/Text';

import { ChapterSummaryForm } from './ChapterSummaryForm';
import { CitationSheet } from './CitationSheet';
import { CourseEnd } from './CourseEnd';
import { CourseFooter } from './CourseFooter';
import { CourseHeader } from './CourseHeader';
import { CourseSection } from './CourseSection';
import { CourseTocSheet } from './CourseTocSheet';
import { SectionMenuSheet } from './SectionMenuSheet';
import { SectionReportSheet } from './SectionReportSheet';
import {
  chapterBadge,
  chapterLocation,
  courseMeta,
  courseWebHref,
  emptyCourseReason,
  quizWebHref,
  summaryPrompt,
} from './view-model';
import { visibleSections, type SectionBox } from './viewport';

const m = fr.mobile.cours;
const t = fr.course;

type SheetKind = 'toc' | 'section' | 'report' | null;

export interface CourseScreenProps {
  /** Module whose course is read (`GET /modules/:mid/course`). */
  readonly moduleId: string;
  /** Chapter selected by the route (`?chapitre=`), `null` on the first visit. */
  readonly chapterId: string | null;
  readonly onBack: () => void;
  readonly onOpenChapter: (chapterId: string) => void;
  /** Opens an internal web path in the in-app browser (ADR-3002 § 3). */
  readonly onOpenWeb: (path: string) => void;
}

/** Reading screen of one chapter of the course. */
export function CourseScreen({
  moduleId,
  chapterId,
  onBack,
  onOpenChapter,
  onOpenWeb,
}: CourseScreenProps) {
  const online = useOnlineStatus();
  const me = useMe();
  const query = useCourseScreen(moduleId, chapterId);
  const screen: ModuleCourseScreen | null = query.data;
  const course = screen?.course ?? null;
  const progress = useCourseProgress(screen);
  const summary = useChapterSummary(moduleId, course?.id ?? null, course?.chapter.id ?? null);
  const report = useSectionReport(moduleId, course?.chapter.id ?? null);

  const list = useRef<FlatList<CourseSectionDto>>(null);
  const scrollY = useRef(0);
  const viewportHeight = useRef(0);
  const headerHeight = useRef(0);
  const heights = useRef(new Map<string, number>());
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [activeSection, setActiveSection] = useState<CourseSectionDto | null>(null);
  const [citation, setCitation] = useState<CourseCitation | null>(null);
  const [reported, setReported] = useState(false);
  const [reportFailed, setReportFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const sections = useMemo(() => course?.sections ?? [], [course]);
  const location = screen === null ? null : chapterLocation(screen);
  const meta = course === null ? '' : courseMeta(course, userTimeZone(me.data));
  const prompt = summaryPrompt(sections);
  const webCourse = screen === null ? '/' : courseWebHref(screen, course?.chapter.id ?? null);

  // ET-2 - the heights are measured by `onLayout` and accumulated in the order of the article: the
  // vertical offset of a FlatList item is relative to its cell, not to the content of the list.
  const measure = useCallback((sectionId: string, _y: number, height: number): void => {
    if (height > 0) heights.current.set(sectionId, height);
  }, []);

  const boxes = useCallback((): SectionBox[] => {
    const result: SectionBox[] = [];
    let y = headerHeight.current;
    for (const section of sections) {
      const height = heights.current.get(section.id) ?? 0;
      result.push({ id: section.id, y, height });
      y += height;
    }
    return result;
  }, [sections]);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
      scrollY.current = event.nativeEvent.contentOffset.y;
      const ids = visibleSections(boxes(), scrollY.current, viewportHeight.current);
      if (ids.length > 0) progress.observe(ids);
    },
    [boxes, progress],
  );

  const scrollToSection = useCallback(
    (section: CourseSectionDto): void => {
      const found = boxes().find((box) => box.id === section.id);
      setSheet(null);
      if (found === undefined) return;
      list.current?.scrollToOffset({
        offset: Math.max(0, found.y - theme.spacing.lg),
        animated: true,
      });
    },
    [boxes],
  );

  const openMenu = useCallback((section: CourseSectionDto): void => {
    setActiveSection(section);
    setReportFailed(false);
    setSheet('section');
  }, []);

  const submitReport = useCallback(
    (reason: string): void => {
      const section = activeSection;
      if (section === null) return;
      void report.report(section.id, reason).then((accepted) => {
        if (!accepted) {
          setReportFailed(true);
          return;
        }
        setReportFailed(false);
        setActiveSection(null);
        setSheet(null);
        setReported(true);
      });
    },
    [activeSection, report],
  );

  const refresh = useCallback((): void => {
    setRefreshing(true);
    void query.refresh().then(() => {
      setRefreshing(false);
    });
  }, [query]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<CourseSectionDto>) => (
      <CourseSection
        onActions={openMenu}
        onCitation={(_section, next) => {
          setCitation(next);
        }}
        onLongPress={openMenu}
        onMeasured={measure}
        section={item}
      />
    ),
    [measure, openMenu],
  );

  const articleHeader = useMemo(
    () => (
      <View
        onLayout={(event) => {
          headerHeight.current = event.nativeEvent.layout.height;
        }}
        style={styles.head}
        testID="course-header-content"
      >
        <View style={styles.tag}>
          <Text style={styles.tagText} tone="indigoInk" variant="label">
            {screen?.module.title ?? ''}
          </Text>
        </View>
        <Text testID="course-title" variant="largeTitle">
          {course?.chapter.title ?? ''}
        </Text>
        <View style={styles.meta}>
          <Icon color={theme.colors.inkMuted} name="clock" size={13} />
          <Text style={styles.metaText} testID="course-meta" tone="muted" variant="caption">
            {meta}
          </Text>
        </View>
      </View>
    ),
    [course, meta, screen?.module.title],
  );

  const articleFooter = useMemo(
    () => (
      <View style={styles.foot}>
        {prompt === null ? null : (
          <ChapterSummaryForm
            failed={false}
            initial={course?.summary ?? null}
            online={online}
            onSubmit={(text) => {
              void summary.submit(text).catch(() => undefined);
            }}
            pending={summary.pending}
            prompt={prompt.contentMd}
          />
        )}
        {course === null ? null : (
          <CourseEnd
            nextChapterId={course.nextChapterId}
            onNext={onOpenChapter}
            onPrevious={onOpenChapter}
            onQuiz={() => {
              if (screen !== null) onOpenWeb(quizWebHref(screen));
            }}
            previousChapterId={course.previousChapterId}
            threshold={course.quiz.threshold}
          />
        )}
        <View style={styles.bottomSpace} />
      </View>
    ),
    [course, onOpenChapter, onOpenWeb, online, prompt, screen, summary],
  );

  const loading = query.status === 'loading' && screen === null;
  const failed = query.status === 'error' && screen === null;
  const reason = screen === null ? 'none' : emptyCourseReason(screen);
  const emptyTitle =
    reason === 'failed'
      ? t.failedTitle
      : reason === 'generating'
        ? m.states.loading
        : m.states.emptyTitle;
  const emptyBody =
    reason === 'failed'
      ? t.failedText
      : reason === 'generating'
        ? m.states.loadingBody
        : m.states.emptyBody;

  return (
    <View style={styles.screen} testID="course-screen">
      <CourseHeader
        badge={location === null ? '' : chapterBadge(location)}
        onBack={() => {
          progress.flush();
          onBack();
        }}
        onToc={() => {
          setSheet('toc');
        }}
        percent={progress.chapterPercent}
      />

      {query.staleVersion ? (
        <Banner
          action={{
            label: m.version.reload,
            onPress: () => {
              query.clearStale();
              list.current?.scrollToOffset({ offset: 0, animated: true });
            },
          }}
          testID="course-version"
          title={m.version.notice}
          tone="info"
        />
      ) : null}
      {reported ? (
        <Banner description={t.reportedNotice} testID="course-reported" tone="info" />
      ) : null}

      {loading ? (
        <View style={styles.center} testID="course-loading">
          <Skeleton animated={false} />
          <Skeleton animated={false} width="70%" />
          <Skeleton animated={false} />
        </View>
      ) : null}

      {failed ? (
        <View style={styles.center}>
          <ErrorState
            description={m.states.errorBody}
            onRetry={query.retry}
            testID="course-error"
            title={m.states.errorTitle}
          />
        </View>
      ) : null}

      {!loading && !failed && course === null ? (
        <View style={styles.center}>
          <EmptyState
            action={{ label: m.states.refresh, onPress: refresh }}
            description={emptyBody}
            icon="layers"
            testID="course-empty"
            title={emptyTitle}
          />
        </View>
      ) : null}

      {course === null ? null : (
        <FlatList
          contentContainerStyle={styles.content}
          data={course.sections}
          keyExtractor={(item) => item.id}
          ListFooterComponent={articleFooter}
          ListHeaderComponent={articleHeader}
          onLayout={(event) => {
            viewportHeight.current = event.nativeEvent.layout.height;
          }}
          onScroll={onScroll}
          ref={list}
          refreshControl={
            <RefreshControl
              colors={[theme.colors.ink]}
              onRefresh={refresh}
              refreshing={refreshing}
              tintColor={theme.colors.ink}
            />
          }
          renderItem={renderItem}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          testID="course-article"
        />
      )}

      <CourseFooter
        onAskTutor={() => {
          onOpenWeb(webCourse);
        }}
        onQuiz={() => {
          if (screen !== null) onOpenWeb(quizWebHref(screen));
        }}
      />

      <CourseTocSheet
        chapters={screen?.chapters ?? []}
        currentChapterId={course?.chapter.id ?? null}
        onChapter={(next) => {
          setSheet(null);
          onOpenChapter(next);
        }}
        onClose={() => {
          setSheet(null);
        }}
        onSection={scrollToSection}
        sections={sections}
        visible={sheet === 'toc'}
      />
      <SectionMenuSheet
        onAskTutor={() => {
          setSheet(null);
          onOpenWeb(webCourse);
        }}
        onClose={() => {
          setSheet(null);
        }}
        onEditOnWeb={() => {
          setSheet(null);
          onOpenWeb(webCourse);
        }}
        onReport={() => {
          setSheet('report');
        }}
        online={online}
        section={sheet === 'section' ? activeSection : null}
      />
      <SectionReportSheet
        failed={reportFailed}
        onClose={() => {
          setSheet(null);
          setActiveSection(null);
        }}
        onSubmit={submitReport}
        pending={report.pending}
        section={sheet === 'report' ? activeSection : null}
      />
      <CitationSheet
        citation={citation}
        onClose={() => {
          setCitation(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.canvas },
  head: { gap: theme.spacing.md, paddingTop: theme.spacing.xl },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.indigoSoft,
    borderRadius: radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  tagText: { textTransform: 'uppercase' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  metaText: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: theme.spacing.xl },
  foot: { gap: theme.spacing.lg },
  bottomSpace: { height: theme.spacing.xxxl },
  center: { gap: theme.spacing.md, padding: theme.spacing.xl },
});
