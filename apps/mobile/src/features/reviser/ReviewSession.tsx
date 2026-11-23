// Game area of the Réviser tab (SPEC-3305 EF-1, EF-2, EF-3, EF-4, BR-MEM-08, BR-MEM-10).
//
// Presentation only: the server DTO, the current position and the correction it sent back are given
// by the route. The card keeps its four self-assessment buttons with their due dates; the other
// games expose « Valider ma réponse », then « Suivant » / « Terminer la session ». The rail, the
// streak and the tutor box follow the game, as on the corrected mockup (ADR-3003 § 2).
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { BrickPublic, CorrectionView } from '@learny/bricks';
import type { GlobalQuizSessionDto, ReviewItemDto, ReviewSummaryDto } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { BrickView } from '../../bricks';
import { formatLongDay } from '../../lib/dates';
import { OfflineBanner } from '../../offline/OfflineBanner';
import { theme } from '../../theme';
import { Button, Card, IconButton, ProgressBar, Text } from '../../ui';

import { RecallGrades, type SelfGradeKey } from './RecallGrades';
import { ReviewRail } from './ReviewRail';
import { canAnswer, isSelfAssessed, progressOf, railOf } from './session-state';
import { SessionEnd } from './SessionEnd';
import { StreakStrip } from './StreakStrip';
import { TutorNote } from './TutorNote';

const t = fr.mobile.reviser;

export interface ReviewWarmupCard {
  readonly count: number;
  readonly onOpen: () => void;
}

export interface ReviewSessionProps {
  readonly session: GlobalQuizSessionDto;
  readonly position: number;
  readonly timeZone: string;
  readonly now: Date;
  readonly online: boolean;
  readonly pending: boolean;
  readonly answerError: boolean;
  readonly completeError: boolean;
  readonly streakDays: number;
  readonly summary: ReviewSummaryDto | null;
  readonly offlineEnded: boolean;
  readonly correction: CorrectionView | undefined;
  readonly response: unknown;
  readonly warmup: ReviewWarmupCard | null;
  readonly toast: string | null;
  readonly onGrade: (grade: SelfGradeKey) => void;
  readonly onResponse: (response: unknown) => void;
  readonly onSubmit: () => void;
  readonly onSkip: () => void;
  readonly onNext: () => void;
  readonly onClose: () => void;
  readonly onUndo: (actionId: string) => void;
  readonly onHome: () => void;
}

function brickOf(item: ReviewItemDto): BrickPublic {
  return {
    brickId: item.brickId,
    versionId: item.brickVersionId,
    type: item.type,
    notionIds: item.notionIds,
    publicPayload: item.payload,
  } as BrickPublic;
}

function eyebrowFor(now: Date, timeZone: string): string {
  const day = formatLongDay(now, timeZone);
  return t.sessionEyebrow(day.charAt(0).toLowerCase() + day.slice(1));
}

/** Screen of the session (EF-1). */
export function ReviewSession(props: ReviewSessionProps) {
  const { session, position, summary } = props;
  const item =
    session.items.find((entry) => entry.position === position) ?? session.items[0] ?? null;
  const progress = progressOf(session, session.items, item?.position ?? 0);
  const entries = railOf(session.items, item?.position ?? 0);
  const ended = summary !== null || props.offlineEnded;
  const last =
    !ended && item !== null && session.items[session.items.length - 1]?.position === item.position;
  const answerable = canAnswer(item) && props.correction === undefined;
  const selfAssessed = isSelfAssessed(item);

  return (
    <View style={styles.base} testID="review-screen">
      <OfflineBanner testID="review-offline-banner" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={undefined}
      >
        <View style={styles.header}>
          <View style={styles.headerTexts}>
            <Text variant="eyebrow" tone="muted">
              {eyebrowFor(props.now, props.timeZone)}
            </Text>
            <Text variant="largeTitle" testID="review-title">
              {t.sessionTitle}
            </Text>
          </View>
          <IconButton
            name="x"
            accessibilityLabel={t.close}
            onPress={props.onClose}
            testID="review-close"
          />
        </View>

        <View style={styles.progressBlock}>
          <View style={styles.progressLine}>
            <Text variant="caption" tone="secondary" testID="review-progress">
              {t.progress.notion(progress.current, progress.total)}
            </Text>
            <Text variant="caption" tone="muted">
              {t.progress.minutes(progress.minutes)}
            </Text>
          </View>
          <ProgressBar
            value={progress.ratio}
            label={t.progress.label(progress.current, progress.total)}
          />
        </View>

        {props.warmup === null ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.warmupCard.title(props.warmup.count)}
            onPress={props.warmup.onOpen}
            style={({ pressed }) => [styles.warmup, pressed ? styles.pressed : null]}
            testID="review-warmup-card"
          >
            <Card>
              <Text variant="title">{t.warmupCard.title(props.warmup.count)}</Text>
              <Text variant="caption" tone="muted">
                {t.warmupCard.open}
              </Text>
            </Card>
          </Pressable>
        )}

        <ReviewRail entries={entries} />

        {ended ? (
          summary === null ? (
            <Card testID="review-offline-end">
              <Text variant="eyebrow" tone="success">
                {t.end.badge}
              </Text>
              <Text variant="sectionTitle">{t.offline.banner}</Text>
              <Button label={t.end.home} onPress={props.onHome} testID="review-end-home" />
            </Card>
          ) : (
            <SessionEnd summary={summary} timeZone={props.timeZone} onHome={props.onHome} />
          )
        ) : item === null ? (
          <Card>
            <Text variant="body">{t.states.emptyTitle}</Text>
          </Card>
        ) : (
          <View style={styles.game} testID="review-game">
            <BrickView
              brick={brickOf(item)}
              mode="play"
              correction={props.correction}
              response={props.response}
              onResponse={props.onResponse}
              disabled={!answerable}
              testID="review-card"
              {...(selfAssessed && answerable
                ? {
                    actions: (
                      <RecallGrades
                        intervals={props.online ? item.intervals : null}
                        timeZone={props.timeZone}
                        now={props.now}
                        disabled={props.pending}
                        onGrade={props.onGrade}
                      />
                    ),
                  }
                : {})}
            />
          </View>
        )}

        <StreakStrip days={props.streakDays} />

        {session.smoothing === null ? null : (
          <TutorNote
            smoothing={session.smoothing}
            online={props.online}
            pending={props.pending}
            onUndo={props.onUndo}
          />
        )}
      </ScrollView>
      {ended ? null : (
        <View style={styles.footer}>
          {selfAssessed || !answerable ? null : (
            <Button
              label={t.validate}
              onPress={props.onSubmit}
              loading={props.pending}
              block
              testID="review-validate"
            />
          )}
          <View style={styles.footerRow}>
            <View style={styles.footerItem}>
              <Button
                label={t.skip}
                variant="outline"
                onPress={props.onSkip}
                disabled={!answerable || props.pending}
                testID="review-skip"
              />
            </View>
            <View style={styles.footerItem}>
              <Button
                label={last ? t.finish : t.next}
                variant="primary"
                onPress={last ? props.onNext : props.onNext}
                disabled={item === null || props.pending}
                testID="review-next"
              />
            </View>
          </View>
          {props.answerError ? (
            <Text variant="caption" tone="danger" testID="review-answer-error">
              {t.states.answerError}
            </Text>
          ) : null}
          {props.completeError ? (
            <Text variant="caption" tone="danger" testID="review-complete-error">
              {t.states.completeError}
            </Text>
          ) : null}
        </View>
      )}

      {props.toast === null ? null : <View style={styles.toastSlot} testID="review-toast" />}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flex: 1, backgroundColor: theme.colors.canvas },
  content: { paddingBottom: theme.spacing.xxl, gap: theme.spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xxl,
  },
  headerTexts: { flex: 1, gap: 2 },
  progressBlock: { paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm },
  progressLine: { flexDirection: 'row', justifyContent: 'space-between' },
  warmup: { paddingHorizontal: theme.spacing.xl },
  pressed: { opacity: 0.9 },
  game: { paddingHorizontal: theme.spacing.xl },
  footer: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.canvas,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  footerRow: { flexDirection: 'row', gap: theme.spacing.sm },
  footerItem: { flex: 1 },
  toastSlot: { height: 0 },
});
