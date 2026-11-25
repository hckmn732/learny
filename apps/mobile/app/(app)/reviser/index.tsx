// Réviser (SPEC-3305 EF-1 to EF-9; BR-MEM-02, BR-MEM-03, BR-MEM-08, BR-AUT-03, BR-AUT-07,
// BR-GAM-02, BR-PLA-01).
//
// The tab plays the session of the day from the server DTO: the rail, the card, the four
// self-assessment buttons, the other games, the streak, the tutor box and the end screen. The
// offline pack (EF-7) is downloaded at the first foreground of the day; offline, the cached pack is
// played, every answer is corrected locally with `gradeBrick` and queued, then replayed in batches
// of fifty when the network returns. The server always makes faith (CL-3).
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { CorrectionView } from '@learny/bricks';
import type { GlobalQuizSessionDto, OfflineEntry, ReviewSummaryDto } from '@learny/contracts';
import { isAppError } from '@learny/core';
import { fr } from '@learny/i18n';

import { requireApiClient } from '../../../src/api/registry';
import { uuidV4 } from '../../../src/api/uuid';
import { secureSessionStorage } from '../../../src/auth/secure-backend';
import { localGrade } from '../../../src/bricks/responses';
import { useStreak } from '../../../src/data/home';
import {
  useGlobalQuizToday,
  useReviewAnswer,
  useReviewComplete,
  useUndoSmoothing,
} from '../../../src/data/review';
import { useFormationOptions, useMe } from '../../../src/data/use-programme';
import { useWarmupToday } from '../../../src/data/warmup';
import {
  reviewAnswerInput,
  skipAnswerInput,
  toBrickCorrection,
} from '../../../src/features/reviser/answers';
import { ReviewSession } from '../../../src/features/reviser/ReviewSession';
import {
  itemAt,
  nextPositionOf,
  startPositionOf,
  summaryOf,
} from '../../../src/features/reviser/session-state';
import { clock } from '../../../src/lib/clock';
import { FALLBACK_TIME_ZONE, formatIsoDay } from '../../../src/lib/dates';
import { useOnlineStatus } from '../../../src/offline/network';
import {
  isPackPlayable,
  type StoredPack,
  packSessionOf,
  readPack,
  storedPack,
  writePack,
} from '../../../src/offline/pack';
import { enqueue, queuedEntry, readQueue, rejectedCount } from '../../../src/offline/queue';
import { syncOfflineQueue } from '../../../src/offline/sync';
import { theme } from '../../../src/theme';
import { EmptyState, ErrorState, Skeleton, Text } from '../../../src/ui';

const t = fr.mobile.reviser;
const shell = fr.mobile.shell;

type ScreenToast = { readonly message: string; readonly testID: string } | null;

/** Root screen of the Réviser tab. */
export default function ReviserRoute() {
  const router = useRouter();
  const online = useOnlineStatus();
  const now = clock.now();
  const me = useMe();
  const sidebar = useFormationOptions();
  const warmups = useWarmupToday();
  const streak = useStreak();
  const [formationId, setFormationId] = useState<string | null>(null);
  const currentFormationId =
    formationId ?? sidebar.current?.id ?? me.data?.currentFormationId ?? null;
  const quiz = useGlobalQuizToday(currentFormationId);
  // No formation at all: the session query never runs, so the screen must not wait for it.
  const noFormation = currentFormationId === null && sidebar.status !== 'loading';
  const answer = useReviewAnswer();
  const complete = useReviewComplete();
  const undo = useUndoSmoothing();

  const [position, setPosition] = useState<number | null>(null);
  const [response, setResponse] = useState<unknown>(undefined);
  const [correction, setCorrection] = useState<CorrectionView | undefined>(undefined);
  const [localSummary, setLocalSummary] = useState<ReviewSummaryDto | null>(null);
  const [offlineEnded, setOfflineEnded] = useState(false);
  const [cached, setCached] = useState<GlobalQuizSessionDto | null>(null);
  const [expired, setExpired] = useState(false);
  const [toast, setToast] = useState<ScreenToast>(null);
  const [answerError, setAnswerError] = useState(false);
  const [completeError, setCompleteError] = useState(false);
  const startedAt = useRef(clock.now().getTime());

  const session = quiz.data ?? cached;
  // Position dérivée du serveur tant que l'écran n'a pas avancé : aucun état écrit depuis un effet.
  const activePosition = position ?? (session === null ? 0 : startPositionOf(session.items));
  const timeZone = me.data?.timezone ?? FALLBACK_TIME_ZONE;
  const summary = localSummary ?? summaryOf(session);
  const streakDays = summary?.streakDays ?? streak.data?.days ?? 0;

  // EF-7 — pack of the day: downloaded once per civil day when the network is there, read from the
  // encrypted store offline. A pack of another day is never played (CL-2).
  useEffect(() => {
    const lifecycle = { cancelled: false };
    void (async () => {
      const today = formatIsoDay(clock.now(), timeZone);
      const cachedPack = await readPack(secureSessionStorage);
      let pack: StoredPack | null = isPackPlayable(cachedPack, today, clock.now())
        ? cachedPack
        : null;
      if (online && currentFormationId !== null && pack === null) {
        try {
          const downloaded = await requireApiClient().api.offlinePack({});
          pack = storedPack(downloaded, clock.now().toISOString());
          await writePack(secureSessionStorage, pack);
        } catch {
          // The prefetch is best effort: the session stays online-first (EF-7).
        }
      }
      if (lifecycle.cancelled) return;
      // Le pack peut être absent : aucun paquet téléchargé et préchargement hors ligne en échec.
      if (pack === null) {
        setExpired(false);
        return;
      }
      setExpired(!isPackPlayable(pack, today, clock.now()));
      setCached(
        currentFormationId === null
          ? null
          : (packSessionOf(pack, currentFormationId)?.session ?? null),
      );
    })();
    return () => {
      lifecycle.cancelled = true;
    };
  }, [online, currentFormationId, timeZone]);

  // EF-8 — answers queued offline are replayed at the return of the network and at the foreground.
  const sync = useCallback(async () => {
    const before = rejectedCount(await readQueue(secureSessionStorage));
    const report = await syncOfflineQueue({
      storage: secureSessionStorage,
      send: (input) => requireApiClient().api.offlineSync({ body: input }),
    });
    if (report.sent === 0) return;
    const total = rejectedCount(await readQueue(secureSessionStorage));
    if (total > before) {
      setToast({ message: t.offline.rejected(total - before), testID: 'review-toast-rejected' });
    } else {
      setToast({ message: t.offline.synced, testID: 'review-toast-synced' });
    }
    await quiz.refetch();
  }, [quiz]);

  useEffect(() => {
    if (!online) return;
    // La synchronisation est un effet de bord réseau : le toast est écrit dans ses callbacks.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- rejeu au retour du réseau (EF-8)
    void sync();
  }, [online, sync]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active' && online) void sync();
    });
    return () => {
      subscription.remove();
    };
  }, [online, sync]);

  const warmup = warmups.data?.items.find((item) => item.status !== 'done') ?? null;

  const advance = useCallback(() => {
    if (session === null) return;
    setCorrection(undefined);
    setResponse(undefined);
    const next = nextPositionOf(session.items, activePosition);
    if (next !== null) {
      setPosition(next);
      startedAt.current = clock.now().getTime();
    }
  }, [session, activePosition]);

  const enqueueOffline = useCallback(
    async (
      itemPosition: number,
      payloadResponse: unknown,
      skipped: boolean,
      selfGrade?: string,
    ) => {
      if (session?.sessionId == null || currentFormationId === null) return;
      const entry: OfflineEntry = {
        clientId: uuidV4(),
        formationId: currentFormationId,
        sessionId: session.sessionId,
        answeredAt: clock.now().toISOString(),
        kind: 'answer',
        position: itemPosition,
        timeMs: Math.min(Math.max(clock.now().getTime() - startedAt.current, 0), 3_600_000),
        ...(skipped ? { skipped: true as const } : { response: payloadResponse }),
        ...(selfGrade === undefined
          ? {}
          : { selfGrade: selfGrade as 'again' | 'hard' | 'good' | 'easy' }),
      };
      await enqueue(secureSessionStorage, queuedEntry(entry));
    },
    [session, currentFormationId],
  );

  const submit = useCallback(
    async (payloadResponse: unknown, skipped: boolean, selfGrade?: string) => {
      const item = session === null ? null : itemAt(session.items, activePosition);
      if (item === null || session?.sessionId == null) return;
      setAnswerError(false);
      const timeMs = clock.now().getTime() - startedAt.current;
      const correctLocally = (): void => {
        if (skipped) return;
        const graded = localGrade(
          item.type as Parameters<typeof localGrade>[0],
          item.payload,
          payloadResponse,
          item.brickVersionId,
        );
        if (graded.ok) {
          setCorrection(graded.value.correction);
        }
      };
      if (!online) {
        correctLocally();
        await enqueueOffline(item.position, payloadResponse, skipped, selfGrade);
        setToast({ message: t.offline.banner, testID: 'review-toast-offline' });
        if (item.type === 'recall_card') advance();
        return;
      }
      try {
        const input = skipped
          ? skipAnswerInput(item, uuidV4(), timeMs)
          : reviewAnswerInput(item, payloadResponse, uuidV4(), timeMs);
        const result = await answer.mutateAsync({ sessionId: session.sessionId, input });
        setCorrection(toBrickCorrection(item.type, result.correction));
        await quiz.refetch();
        if (item.type === 'recall_card') advance();
      } catch (error) {
        if (isAppError(error) && (error.code === 'CONFLICT' || error.code === 'SESSION_CLOSED')) {
          // ET-3 — another client answered already: the server state makes faith.
          await quiz.refetch();
          advance();
          return;
        }
        if (isAppError(error) && error.code === 'NETWORK_ERROR') {
          // EF-9 — transparent switch: the answer is queued and corrected locally, the position is
          // kept.
          correctLocally();
          await enqueueOffline(item.position, payloadResponse, skipped, selfGrade);
          return;
        }
        setAnswerError(true);
      }
    },
    [answer, advance, activePosition, enqueueOffline, online, quiz, session],
  );

  const finish = useCallback(async () => {
    if (session?.sessionId == null) return;
    if (!online) {
      await enqueue(
        secureSessionStorage,
        queuedEntry({
          clientId: uuidV4(),
          formationId: session.formationId,
          sessionId: session.sessionId,
          answeredAt: clock.now().toISOString(),
          kind: 'complete',
        }),
      );
      setOfflineEnded(true);
      return;
    }
    try {
      const value = await complete.mutateAsync(session.sessionId);
      setLocalSummary(value);
      await quiz.refetch();
    } catch {
      setCompleteError(true);
    }
  }, [complete, online, quiz, session]);

  const onNext = useCallback(() => {
    if (session === null) return;
    const item = itemAt(session.items, activePosition);
    if (item === null) return;
    if (nextPositionOf(session.items, activePosition) === null) {
      void finish();
      return;
    }
    advance();
  }, [advance, activePosition, finish, session]);

  const undoDeferral = useCallback(
    (actionId: string) => {
      if (!online) {
        setToast({ message: t.tutor.offline, testID: 'review-toast-undo-offline' });
        return;
      }
      undo.mutate(actionId, {
        onSuccess: () => {
          void quiz.refetch();
        },
        onError: () => {
          setToast({ message: t.tutor.undoError, testID: 'review-toast-undo-error' });
        },
      });
    },
    [online, quiz, undo],
  );

  if (quiz.status === 'error' && cached === null) {
    return (
      <View style={styles.state} testID="reviser-screen">
        <ErrorState title={t.states.errorTitle} onRetry={() => void quiz.refetch()} />
      </View>
    );
  }

  if (session === null) {
    const paused = quiz.data?.status === 'paused';
    return (
      <View style={styles.state} testID="reviser-screen">
        {expired ? (
          <EmptyState icon="cards" title={t.offline.expired} testID="reviser-expired" />
        ) : quiz.status === 'loading' && !noFormation ? (
          <Skeleton testID="reviser-loading" />
        ) : paused ? (
          <EmptyState
            icon="cards"
            title={t.states.pausedTitle}
            description={t.states.pausedBody}
            testID="reviser-paused"
          />
        ) : (
          <EmptyState
            icon="cards"
            title={t.states.emptyTitle}
            description={t.states.emptyBody}
            action={{
              label: shell.tabs.today,
              onPress: () => {
                router.push('/aujourdhui');
              },
            }}
            testID="reviser-empty"
          />
        )}
      </View>
    );
  }

  const formations = warmups.data?.items ?? [];

  return (
    <View style={styles.base}>
      {formations.length > 1 ? (
        <ScrollView horizontal contentContainerStyle={styles.formations} testID="review-formations">
          {formations.map((entry) => (
            <Pressable
              key={entry.formationId}
              accessibilityRole="button"
              accessibilityState={{ selected: entry.formationId === currentFormationId }}
              onPress={() => {
                setFormationId(entry.formationId);
                setLocalSummary(null);
                setPosition(null);
                setOfflineEnded(false);
              }}
              testID={`review-formation-${entry.formationId}`}
            >
              <Text
                variant="chip"
                tone={entry.formationId === currentFormationId ? 'primary' : 'muted'}
              >
                {entry.formationId === currentFormationId
                  ? 'Formation courante'
                  : 'Autre formation'}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <ReviewSession
        session={session}
        position={position ?? 0}
        timeZone={timeZone}
        now={now}
        online={online}
        pending={answer.isPending || complete.isPending}
        answerError={answerError}
        completeError={completeError}
        streakDays={streakDays}
        summary={summary}
        offlineEnded={offlineEnded}
        correction={correction}
        response={response}
        warmup={
          warmup === null
            ? null
            : {
                count: warmup.items.length,
                onOpen: () => {
                  router.push(`/reviser/echauffement/${warmup.activityId}`);
                },
              }
        }
        toast={toast === null ? null : toast.message}
        onGrade={(grade) => {
          void submit({ selfGrade: grade }, false, grade);
        }}
        onResponse={setResponse}
        onSubmit={() => {
          void submit(response, false);
        }}
        onSkip={() => {
          void submit(undefined, true);
        }}
        onNext={onNext}
        onClose={() => {
          router.push('/aujourdhui');
        }}
        onUndo={undoDeferral}
        onHome={() => {
          router.push('/aujourdhui');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flex: 1, backgroundColor: theme.colors.canvas },
  state: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    backgroundColor: theme.colors.canvas,
  },
  formations: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
  },
});
