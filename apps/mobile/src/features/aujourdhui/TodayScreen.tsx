// Aujourd'hui (SPEC-3201 EF-1 to EF-9, ET-2, CL-5; BR-PRO-02, BR-AUT-01/12/13, BR-GAM-01/02).
//
// The tab screen of the day: the native header of SPEC-3102 (bell, pastille, account), the ink card
// of the highlighted session, the three figures, the warm-up, the actions of the tutor and the rest
// of the day. The server decides every value (`/home`, `/streak`, `/me/automation-actions`,
// `/warmups/today`); this screen formats them in the zone of the learner, recomputes « Dans N min »
// every minute while it is visible and never reads the system clock (ADR-0047).
//
// States: skeleton on the first read, « Réessayer » on an error, « Aucune formation active » without
// an active formation (EF-7 of SPEC-3102), « Rien de prévu aujourd'hui » on an empty day (EF-9).
// Offline: the cache stays on screen and the mutations wait for the network (CL-5).
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import type { AutomationActionItem } from '@learny/contracts';
import { isAppError } from '@learny/core';
import { fr } from '@learny/i18n';

import { messageFor } from '../../api/errors';
import {
  useAutomationActions,
  useGaps,
  useHome,
  useRefreshToday,
  useStreak,
  useTutorActions,
  useWarmupsToday,
} from '../../data/home';
import { FALLBACK_TIME_ZONE } from '../../lib/dates';
import { openOnWeb } from '../../lib/web';
import { useOnlineStatus } from '../../offline/network';
import { theme } from '../../theme';
import { EmptyState } from '../../ui/EmptyState';
import { ErrorState } from '../../ui/ErrorState';
import { Skeleton } from '../../ui/Skeleton';
import { Toast } from '../../ui/Toast';
import { AppHeader } from '../shell/AppHeader';

import { SessionHeroCard } from './SessionHeroCard';
import { StatsRow } from './StatsRow';
import { GapsSheet, LaterSheet, RetentionSheet, StreakSheet, TutorFeedSheet } from './TodaySheets';
import { TutorActionsSection } from './TutorActionsSection';
import { UpNextSection } from './UpNextSection';
import { useNow, useScreenFocused } from './use-today';
import {
  gapsFormationOf,
  heroOf,
  linesOf,
  nextActivityOf,
  retentionOf,
  streakDays,
  warmupCardOf,
  type DayLine,
} from './view-model';
import { WarmupCard } from './WarmupCard';

const t = fr.mobile.today;
const shell = fr.mobile.shell;

type SheetName = 'streak' | 'retention' | 'gaps' | 'later' | 'feed' | null;

interface ToastState {
  readonly message: string;
  readonly testID: string;
}

/** True when the server refused the action because another client already handled it (CL-3). */
export function isConflict(error: unknown): boolean {
  return isAppError(error) && error.code === 'CONFLICT';
}

/** Root screen of the Aujourd'hui tab. */
export function TodayScreen() {
  const router = useRouter();
  const focused = useScreenFocused();
  const now = useNow(focused);
  const online = useOnlineStatus();
  const refreshAll = useRefreshToday();

  const homeQuery = useHome();
  const streak = useStreak();
  const automations = useAutomationActions();
  const warmups = useWarmupsToday();
  const home = homeQuery.data;
  const gaps = useGaps(home === null ? null : gapsFormationOf(home));
  const tutor = useTutorActions();

  const [sheet, setSheet] = useState<SheetName>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const notify = useCallback((message: string, testID: string) => {
    setToast({ message, testID });
  }, []);

  const timeZone = streak.data?.timezone ?? FALLBACK_TIME_ZONE;
  const hero = home === null ? null : heroOf(home, now);
  const lines = home === null ? [] : linesOf(home, now, hero?.slotId ?? null);
  const warmup = warmupCardOf(warmups.data);

  const refresh = useCallback(() => {
    refreshAll();
    streak.refetch();
    automations.refetch();
    warmups.refetch();
  }, [refreshAll, streak, automations, warmups]);

  const openDestination = useCallback(
    (destination: { readonly kind: 'app' | 'web'; readonly path: string }) => {
      if (destination.kind === 'app') {
        router.push(destination.path);
        return;
      }
      void openOnWeb(destination.path)
        .then(() => {
          notify(t.toasts.startOnWeb, 'today-toast-start');
        })
        .catch((cause: unknown) => {
          notify(messageFor(cause), 'today-toast-error');
        });
    },
    [notify, router],
  );

  const runAction = useCallback(
    (item: AutomationActionItem, action: 'accept' | 'decline' | 'undo', choice?: string) => {
      void tutor
        .run({
          id: item.id,
          action,
          ...(choice === undefined ? {} : { choice: { startsAt: choice } }),
        })
        .then(() => {
          const message =
            action === 'accept'
              ? t.toasts.accepted
              : action === 'decline'
                ? t.toasts.declined
                : t.toasts.undone;
          notify(message, 'today-toast-action');
        })
        .catch((cause: unknown) => {
          if (isConflict(cause)) {
            automations.refetch();
            notify(t.toasts.conflict, 'today-toast-conflict');
            return;
          }
          notify(messageFor(cause), 'today-toast-error');
        });
    },
    [automations, notify, tutor],
  );

  const onLine = (line: DayLine): void => {
    openDestination(line.destination);
  };

  const noFormation =
    home !== null && home.formations.ongoing.length === 0 && home.formations.completed.length === 0;
  const emptyDay = home !== null && !noFormation && home.today.slots.length === 0;

  return (
    <View style={styles.base} testID="today-screen">
      <AppHeader
        title={shell.tabs.today}
        {...(home === null ? {} : { eyebrow: home.today.label })}
        actions
        active={focused}
        testID="today-header"
      />

      <ScrollView
        testID="today-scroll"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={homeQuery.refreshing}
            onRefresh={refresh}
            tintColor={theme.colors.inkMuted}
            colors={[theme.colors.ink]}
          />
        }
      >
        {homeQuery.status === 'loading' ? (
          <View style={styles.skeleton} testID="today-loading">
            <Skeleton animated={false} lines={3} />
            <Skeleton animated={false} lines={2} />
            <Skeleton animated={false} lines={4} />
          </View>
        ) : null}

        {homeQuery.status === 'error' ? (
          <ErrorState
            testID="today-error"
            title={t.actions.loadError}
            description={fr.mobile.ui.errorBody}
            onRetry={homeQuery.refetch}
          />
        ) : null}

        {noFormation ? (
          <EmptyState
            testID="today-no-formation"
            icon="layers"
            title={shell.states.noFormationTitle}
            description={shell.states.noFormationBody}
            action={{
              label: shell.states.createFormation,
              onPress: () => {
                void openOnWeb('/formations/nouvelle');
              },
            }}
          />
        ) : null}

        {emptyDay ? (
          <EmptyState
            testID="today-empty"
            icon="calendar"
            title={t.noSession}
            description={nextActivityOf(home) ?? t.noSessionBody}
          />
        ) : null}

        {hero === null ? null : (
          <SessionHeroCard
            hero={hero}
            online={online}
            onStart={() => {
              openDestination(hero.destination);
            }}
            onLater={() => {
              setSheet('later');
            }}
          />
        )}

        {home === null || noFormation ? null : (
          <StatsRow
            streakDays={streakDays(streak.data)}
            retention={retentionOf(home)}
            gaps={gaps.data?.summary.openGaps ?? null}
            onPressStreak={() => {
              setSheet('streak');
            }}
            onPressRetention={() => {
              setSheet('retention');
            }}
            onPressGaps={() => {
              setSheet('gaps');
            }}
          />
        )}

        {warmup === null ? null : (
          <WarmupCard
            warmup={warmup}
            onOpen={() => {
              openDestination({
                kind: 'web',
                path: warmup.href.startsWith('#') ? '/reviser' : warmup.href,
              });
            }}
          />
        )}

        {home === null || noFormation ? null : (
          <TutorActionsSection
            pending={automations.pending}
            recent={automations.recent}
            online={online}
            busy={tutor.pending}
            timeZone={timeZone}
            onSeeAll={() => {
              setSheet('feed');
            }}
            onAccept={(item) => {
              runAction(item, 'accept');
            }}
            onDecline={(item) => {
              runAction(item, 'decline');
            }}
            onUndo={(item) => {
              runAction(item, 'undo');
            }}
            onChooseSlot={(item, startsAt) => {
              runAction(item, 'accept', startsAt);
            }}
          />
        )}

        {lines.length === 0 ? null : <UpNextSection lines={lines} onOpen={onLine} />}
      </ScrollView>

      <StreakSheet
        visible={sheet === 'streak'}
        onClose={() => {
          setSheet(null);
        }}
        streak={streak.data}
      />
      <RetentionSheet
        visible={sheet === 'retention'}
        onClose={() => {
          setSheet(null);
        }}
        oneMonth={home === null ? null : home.retention.oneMonth}
        twoMonths={home === null ? null : home.retention.twoMonths}
        followed={gaps.data?.summary.masteredNotions ?? null}
        toConsolidate={gaps.data?.summary.openGaps ?? null}
      />
      <GapsSheet
        visible={sheet === 'gaps'}
        onClose={() => {
          setSheet(null);
        }}
        gaps={gaps.data}
        onOpenWeb={() => {
          setSheet(null);
          void openOnWeb('/lacunes');
        }}
      />
      <LaterSheet
        visible={sheet === 'later'}
        onClose={() => {
          setSheet(null);
        }}
        slotId={hero?.slotId ?? null}
        timeZone={timeZone}
        online={online}
        onMoved={(label) => {
          notify(t.toasts.moved(label), 'today-toast-moved');
        }}
        onOpenAgenda={() => {
          setSheet(null);
          router.push('/agenda');
        }}
      />
      <TutorFeedSheet
        visible={sheet === 'feed'}
        onClose={() => {
          setSheet(null);
        }}
        items={[...automations.pending, ...automations.recent]}
        weekCount={automations.weekCount}
        online={online}
        busy={tutor.pending}
        onUndo={(item) => {
          runAction(item, 'undo');
        }}
      />

      <View style={styles.toast} pointerEvents="box-none">
        <Toast
          visible={toast !== null}
          message={toast?.message ?? ''}
          {...(toast === null ? {} : { testID: toast.testID })}
          onHide={() => {
            setToast(null);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flex: 1, backgroundColor: theme.colors.canvas },
  content: {
    gap: theme.spacing.lg,
    paddingBottom: theme.spacing.xxxl,
    paddingHorizontal: theme.spacing.xl,
  },
  skeleton: { gap: theme.spacing.sm },
  toast: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: theme.spacing.xxxl,
    alignItems: 'center',
  },
});
