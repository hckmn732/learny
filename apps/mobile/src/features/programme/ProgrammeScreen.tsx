// Programme tab (SPEC-3202 EF-1 to EF-7, ET-1, ET-3; ADR-3002 § 3, ADR-3003).
//
// The formation being read with its progress, the modules and their chapters (locked, open,
// validated), the reading resume, the calendar, the formation switcher and the web hand-offs of
// creation and import. Every value comes from the API; the cache of SPEC-3003 keeps the screen
// readable offline (CL-4). Nothing of the programme is ever written from the application: the only
// mutation is the current-formation preference (BR-FOR-11, CA-3).
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { isActiveProgramme } from '@learny/contracts';
import { fr } from '@learny/i18n';

import {
  formationSigil,
  useFormationOptions,
  useFormationsList,
  useMe,
  useModuleCourse,
  useProgramme,
  useSwitchFormation,
} from '../../data/use-programme';
import { openOnWeb } from '../../lib/web';
import { useOnlineStatus } from '../../offline/network';
import { theme } from '../../theme';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { ErrorState } from '../../ui/ErrorState';
import { Fab } from '../../ui/Fab';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { Skeleton } from '../../ui/Skeleton';
import { Text } from '../../ui/Text';
import { useStartQuiz } from '../quiz/use-start-quiz';

import { FormationCard } from './FormationCard';
import { FormationSwitcherSheet } from './FormationSwitcherSheet';
import { ModuleAccordion } from './ModuleAccordion';
import { ProgrammeCalendar } from './ProgrammeCalendar';
import { ProgrammeHeader, programmeStyles } from './ProgrammeHeader';
import { buildProgrammeView, type ChapterView, type ModuleView } from './view-model';
import { WebHandoffSheet, type WebHandoffKind } from './WebHandoffSheet';

const t = fr.mobile.programme;

type SheetKind = 'switch' | 'locked' | WebHandoffKind | null;

/** Root screen of the Programme tab. */
export function ProgrammeScreen() {
  const router = useRouter();
  const online = useOnlineStatus();
  const me = useMe();
  const options = useFormationOptions();
  const list = useFormationsList();
  const [view, setView] = useState<'modules' | 'calendrier'>('modules');
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [locked, setLocked] = useState<ModuleView | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const switching = useSwitchFormation();

  const explicitId =
    me.data?.currentFormationId ??
    options.current?.id ??
    options.formations.find((formation) => formation.status === 'active')?.id ??
    null;
  const candidate = list.items.find((formation) => formation.status !== 'archived') ?? null;
  const formationId = explicitId ?? candidate?.id ?? null;

  const programme = useProgramme(formationId);
  const active =
    programme.data !== null && isActiveProgramme(programme.data) ? programme.data : null;
  const proposal =
    programme.data !== null && !isActiveProgramme(programme.data) ? programme.data : null;
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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([options.refresh(), programme.refresh(), course.refresh()]);
    setRefreshing(false);
  }, [options, programme, course]);

  const title =
    active?.formation.title ??
    proposal?.title ??
    options.current?.title ??
    candidate?.title ??
    t.formationFallback;
  const sigil = options.current?.monogram ?? formationSigil(title);
  const canSwitch = options.formations.length > 1;

  const starter = useStartQuiz();
  const openWeb = (path: string): void => {
    setSheet(null);
    void openOnWeb(path);
  };

  const openChapter = (chapter: ChapterView): void => {
    void openOnWeb(chapter.courseHref);
  };
  // SPEC-3304 EF-1 — « Quiz de validation » crée (ou reprend) la tentative et ouvre l'écran plein
  // écran ; un refus (délai de nouvelle tentative, banque en préparation) ouvre la fiche du module,
  // qui porte le message et le bouton de reprise.
  const openQuiz = (module: ModuleView): void => {
    void starter.start(module.id).then((outcome) => {
      if (!outcome.ok) {
        openDetail(module);
        return;
      }
      router.push(`/quiz/${outcome.attemptId}`);
    });
  };
  const openResume = (chapterId: string): void => {
    const chapter = active?.chapters.find((entry) => entry.id === chapterId);
    if (chapter !== undefined) void openOnWeb(chapter.courseHref);
  };
  const openDetail = (module: ModuleView): void => {
    router.push({
      pathname: '/programme/module/[moduleId]',
      params: { moduleId: module.id, ...(formationId === null ? {} : { fid: formationId }) },
    });
  };

  const selectFormation = async (id: string): Promise<void> => {
    setSwitchError(null);
    try {
      await switching.switchTo(id);
      setSheet(null);
    } catch {
      setSwitchError(t.states.errorTitle);
    }
  };

  const loading =
    (me.status === 'loading' ||
      options.status === 'loading' ||
      list.status === 'loading' ||
      programme.status === 'loading') &&
    model === null &&
    proposal === null;
  const failed =
    me.status === 'error' ||
    options.status === 'error' ||
    list.status === 'error' ||
    programme.status === 'error';
  const noFormation = !loading && !failed && formationId === null && list.items.length === 0;
  const needsProposal =
    proposal !== null ||
    (programme.status === 'error' &&
      (candidate?.status === 'cadrage' || candidate?.status === 'programme_proposed'));

  return (
    <View style={programmeStyles.screen} testID="programme-screen">
      <ProgrammeHeader
        formation={title}
        canSwitch={canSwitch}
        onSwitch={() => {
          setSwitchError(null);
          setSheet('switch');
        }}
        {...(Platform.OS === 'ios'
          ? {
              onNewFormation: () => {
                setSheet('create');
              },
            }
          : {})}
      />

      <ScrollView
        contentContainerStyle={programmeStyles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void onRefresh();
            }}
            tintColor={theme.colors.ink}
            colors={[theme.colors.ink]}
          />
        }
      >
        {loading ? (
          <View style={styles.skeleton} testID="programme-loading">
            <Text variant="caption" tone="muted">
              {t.states.loading}
            </Text>
            <Skeleton animated={false} />
            <Skeleton animated={false} width="80%" />
            <Skeleton animated={false} />
          </View>
        ) : null}

        {failed && model === null && !needsProposal ? (
          <ErrorState
            testID="programme-error"
            title={t.states.errorTitle}
            description={t.states.errorBody}
            onRetry={programme.retry}
          />
        ) : null}

        {noFormation ? (
          <EmptyState
            testID="programme-empty"
            icon="layers"
            title={t.states.noFormationTitle}
            description={t.states.noFormationBody}
            action={{
              label: t.states.noFormationAction,
              onPress: () => {
                void openOnWeb('/formations/nouvelle');
              },
            }}
          />
        ) : null}

        {needsProposal && formationId !== null ? (
          <EmptyState
            testID="programme-proposal"
            icon="sparkles"
            title={t.proposal.title}
            description={t.proposal.body}
            action={{
              label: t.proposal.action,
              onPress: () => {
                void openOnWeb(`/formations/${formationId}/programme`);
              },
            }}
          />
        ) : null}

        {model === null ? null : (
          <>
            <FormationCard
              formation={model.formation}
              sigil={sigil}
              onPress={() => {
                if (canSwitch) setSheet('switch');
              }}
            />

            <Segmented
              testID="programme-segmented"
              label={t.views.label}
              options={[
                { value: 'modules', label: t.views.modules },
                { value: 'calendrier', label: t.views.calendar },
              ]}
              value={view}
              onChange={(value) => {
                setView(value === 'calendrier' ? 'calendrier' : 'modules');
              }}
            />

            <Button
              testID="programme-import"
              label={t.importProgramme}
              icon="plus"
              variant="text"
              size="sm"
              onPress={() => {
                setSheet('import');
              }}
            />

            {model.formation.paused ? (
              <View style={styles.banner} testID="programme-paused">
                <Text variant="title">{t.banner.pausedTitle}</Text>
                <Text variant="rowSubtitle" tone="muted">
                  {t.banner.pausedBody}
                </Text>
                <Button
                  label={t.banner.pausedAction}
                  size="sm"
                  variant="outline"
                  onPress={() => {
                    setSheet('paused');
                  }}
                />
              </View>
            ) : null}

            {model.formation.completed ? (
              <View style={styles.banner} testID="programme-completed">
                <Text variant="title">{t.banner.completedTitle}</Text>
                <Text variant="rowSubtitle" tone="muted">
                  {t.banner.completedBody}
                </Text>
                <Button
                  label={t.banner.completedAction}
                  size="sm"
                  variant="outline"
                  onPress={() => {
                    setSheet('completed');
                  }}
                />
              </View>
            ) : null}

            {view === 'modules'
              ? model.modules.map((module) => (
                  <ModuleAccordion
                    key={module.id}
                    module={module}
                    resume={module.id === openModule?.id ? model.resume : null}
                    onChapter={(chapter) => {
                      openChapter(chapter);
                    }}
                    onQuiz={openQuiz}
                    onResume={(resume) => {
                      openResume(resume.chapterId);
                    }}
                    onLocked={(entry) => {
                      setLocked(entry);
                      setSheet('locked');
                    }}
                    onDetail={openDetail}
                  />
                ))
              : null}

            {view === 'calendrier' ? (
              <ProgrammeCalendar
                calendar={active?.calendar ?? []}
                modules={model.modules}
                today={active?.today ?? ''}
                start={active?.formation.startDate ?? null}
                end={active?.formation.endDate ?? null}
                onQuiz={openQuiz}
              />
            ) : null}
          </>
        )}
      </ScrollView>

      {Platform.OS === 'android' ? (
        <View style={programmeStyles.fab} testID="programme-fab">
          <Fab
            icon="plus"
            accessibilityLabel={t.newFormation}
            onPress={() => {
              setSheet('create');
            }}
          />
        </View>
      ) : null}

      <FormationSwitcherSheet
        visible={sheet === 'switch'}
        onClose={() => {
          setSheet(null);
        }}
        formations={options.formations}
        currentFormationId={formationId}
        offline={!online}
        pending={switching.pending}
        error={switchError}
        onSelect={(id) => {
          void selectFormation(id);
        }}
        onResumeOnWeb={(id) => {
          openWeb(`/formations/${id}/programme`);
        }}
      />

      {sheet === 'create' ? (
        <WebHandoffSheet
          kind="create"
          visible
          onClose={() => {
            setSheet(null);
          }}
          onContinue={() => {
            openWeb('/formations/nouvelle');
          }}
        />
      ) : null}
      {sheet === 'import' && formationId !== null ? (
        <WebHandoffSheet
          kind="import"
          visible
          onClose={() => {
            setSheet(null);
          }}
          onContinue={() => {
            openWeb(`/formations/${formationId}/programme`);
          }}
        />
      ) : null}
      {sheet === 'proposal' && formationId !== null ? (
        <WebHandoffSheet
          kind="proposal"
          visible
          onClose={() => {
            setSheet(null);
          }}
          onContinue={() => {
            openWeb(`/formations/${formationId}/programme`);
          }}
        />
      ) : null}
      {sheet === 'paused' && formationId !== null ? (
        <WebHandoffSheet
          kind="paused"
          visible
          onClose={() => {
            setSheet(null);
          }}
          onContinue={() => {
            openWeb(`/formations/${formationId}/programme`);
          }}
        />
      ) : null}
      {sheet === 'completed' && formationId !== null ? (
        <WebHandoffSheet
          kind="completed"
          visible
          onClose={() => {
            setSheet(null);
          }}
          onContinue={() => {
            openWeb(`/formations/${formationId}/bilan`);
          }}
        />
      ) : null}

      <Sheet
        visible={sheet === 'locked' && locked !== null}
        onClose={() => {
          setSheet(null);
        }}
        title={locked === null ? '' : t.locked.title(locked.position)}
        testID="programme-locked"
      >
        <Text variant="body" tone="secondary">
          {locked === null
            ? ''
            : t.locked.body(locked.unlockAfterPosition ?? Math.max(1, locked.position - 1))}
        </Text>
        <Button
          label={t.locked.close}
          onPress={() => {
            setSheet(null);
          }}
          block
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: { gap: theme.spacing.sm },
  banner: {
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surfaceSubtle,
  },
});
