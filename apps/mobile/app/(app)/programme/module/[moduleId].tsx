// Module detail, read-only (SPEC-3202 EF-4, instructions § 8.2; BR-FOR-05, BR-FOR-08).
//
// Opened from a module of the Programme tab: position, title, status, dates, threshold and the
// chapters with their reading progress. A locked module shows only its unlock condition
// (BR-FOR-08). Adding contributions, exercises and the quiz are out of the mobile scope and open
// the web page (ADR-3002 § 3); nothing is written here.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { isActiveProgramme } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { useMe, useModuleCourse, useProgramme } from '../../../../src/data/use-programme';
import { ChapterRow } from '../../../../src/features/programme/ChapterRow';
import { buildProgrammeView } from '../../../../src/features/programme/view-model';
import { useStartQuiz } from '../../../../src/features/quiz/use-start-quiz';
import { openOnWeb } from '../../../../src/lib/web';
import { theme } from '../../../../src/theme';
import { Button } from '../../../../src/ui/Button';
import { Card } from '../../../../src/ui/Card';
import { Chip } from '../../../../src/ui/Chip';
import { EmptyState } from '../../../../src/ui/EmptyState';
import { ErrorState } from '../../../../src/ui/ErrorState';
import { IconButton } from '../../../../src/ui/IconButton';
import { Skeleton } from '../../../../src/ui/Skeleton';
import { Text } from '../../../../src/ui/Text';

const t = fr.mobile.programme;

/** Read-only screen of one module. */
export default function ModuleRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ moduleId?: string; fid?: string }>();
  const moduleId = typeof params.moduleId === 'string' ? params.moduleId : '';
  const me = useMe();
  const explicit = typeof params.fid === 'string' ? params.fid : null;
  const formationId = explicit ?? me.data?.currentFormationId ?? null;
  const programme = useProgramme(formationId);
  const active =
    programme.data !== null && isActiveProgramme(programme.data) ? programme.data : null;
  const openModule = active?.modules.find((module) => module.status === 'open') ?? null;
  const course = useModuleCourse(openModule?.id ?? null);
  const courseProgress = useMemo(() => {
    if (course.data === null) return null;
    return {
      chapters: course.data.chapters,
      selectedChapterId: course.data.course?.chapter.id ?? course.data.selectedChapterId,
      readingMinutes: course.data.course?.readingMinutes ?? 1,
    };
  }, [course.data]);
  const model = useMemo(
    () =>
      active === null ? null : buildProgrammeView({ programme: active, course: courseProgress }),
    [active, courseProgress],
  );
  const module = model?.modules.find((entry) => entry.id === moduleId) ?? null;
  // SPEC-3304 EF-1 — « Quiz de validation » crée (ou reprend) la tentative puis ouvre l'écran
  // plein écran ; le quiz n'est plus renvoyé au web (ADR-3002, périmètre V1).
  const starter = useStartQuiz();
  const [quizError, setQuizError] = useState<string | null>(null);

  return (
    <View style={styles.screen} testID="module-screen">
      <View style={styles.nav}>
        <IconButton
          name="chevronLeft"
          accessibilityLabel={t.moduleScreen.back}
          onPress={() => {
            router.back();
          }}
          testID="module-back"
        />
        <Text variant="eyebrow" tone="muted">
          {t.moduleScreen.title}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {programme.status === 'loading' ? (
          <View style={styles.skeleton}>
            <Skeleton animated={false} />
            <Skeleton animated={false} width="70%" />
          </View>
        ) : null}
        {programme.status === 'error' ? (
          <ErrorState testID="module-error" onRetry={programme.retry} />
        ) : null}
        {programme.status === 'ready' && module === null ? (
          <EmptyState icon="layers" title={t.moduleScreen.unavailable} testID="module-missing" />
        ) : null}

        {module === null ? null : (
          <>
            <Card testID={`module-detail-${String(module.position)}`}>
              <View style={styles.head}>
                <View style={styles.grow}>
                  <Text variant="largeTitle">{module.title}</Text>
                  <Text variant="rowSubtitle" tone="muted">
                    {module.meta}
                  </Text>
                </View>
                <Chip
                  label={module.statusLabel}
                  tone={
                    module.status === 'validated'
                      ? 'green'
                      : module.status === 'open'
                        ? theme.platform === 'ios'
                          ? 'lime'
                          : 'neutral'
                        : 'neutral'
                  }
                />
              </View>
              {module.locked ? (
                <Text variant="body" tone="secondary" testID="module-unlock-reason">
                  {module.unlockLabel ?? ''}
                </Text>
              ) : null}
            </Card>

            {module.locked ? null : (
              <Card>
                <Text variant="sectionTitle" style={styles.chaptersTitle}>
                  {t.moduleScreen.chapters}
                </Text>
                {module.chapters.map((chapter) => (
                  <ChapterRow
                    key={chapter.id}
                    chapter={chapter}
                    onPress={() => {
                      // SPEC-3302 EF-1 — the native course screen replaces the web page of a chapter.
                      router.push({
                        pathname: '/cours/[courseId]',
                        params: { courseId: moduleId, chapitre: chapter.id },
                      });
                    }}
                  />
                ))}
              </Card>
            )}

            {module.href === null ? null : (
              <View style={styles.actions}>
                <Button
                  label={t.moduleScreen.apports}
                  variant="outline"
                  onPress={() => {
                    void openOnWeb(module.href ?? '');
                  }}
                  testID="module-detail-apports"
                />
                <Button
                  label={t.moduleScreen.quiz}
                  loading={starter.pending}
                  onPress={() => {
                    setQuizError(null);
                    void starter.start(module.id).then((outcome) => {
                      if (!outcome.ok) {
                        setQuizError(outcome.message);
                        return;
                      }
                      router.push(`/quiz/${outcome.attemptId}`);
                    });
                  }}
                  testID="module-detail-quiz"
                />
                {starter.preparing ? (
                  <Text variant="caption" tone="secondary" testID="module-quiz-preparing">
                    {t.moduleScreen.quizPreparing}
                  </Text>
                ) : null}
                {quizError === null ? null : (
                  <Text variant="caption" tone="danger" testID="module-quiz-error">
                    {quizError}
                  </Text>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.canvas },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
  },
  content: {
    gap: theme.spacing.lg,
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.xxxl,
  },
  skeleton: { gap: theme.spacing.sm },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md },
  grow: { flex: 1, minWidth: 0, gap: theme.spacing.xs },
  chaptersTitle: { marginBottom: theme.spacing.sm },
  actions: { gap: theme.spacing.sm },
});
