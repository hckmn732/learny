// Tutor sheet of the course (SPEC-3303 EF-1 to EF-7; ADR-3010).
//
// A native sheet over the course: header (ink tile with the lime sparkle, « Tuteur », the chapter
// subtitle, « Nouvelle discussion », cross), the context line, the thread (learner bubbles in ink
// on the right, tutor answers on a light card in Markdown, sources and follow-ups as chips), the
// composer and the footnote of the mockup. Presentational: every side effect comes from the
// controller through the callbacks, so Jest renders it without a client nor a device.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ContextKey, FollowUpDto, TutorSourceDto } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { openExternal } from '../../lib/web';
import { controls, radius, theme, verticalHitSlop } from '../../theme';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Chip } from '../../ui/Chip';
import { Icon } from '../../ui/Icon';
import { Markdown } from '../../ui/Markdown';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { Toast } from '../../ui/Toast';

import { CardSheet } from './CardSheet';
import { Composer } from './Composer';
import { ContextSheet } from './ContextSheet';
import { cardFieldsOf, type TutorMessageView, type TutorSnapshot } from './conversation-controller';

const t = fr.mobile.tutor;

/** One bubble of the thread: a committed message or the reply being written. */
type ThreadItem =
  | { readonly kind: 'message'; readonly key: string; readonly message: TutorMessageView }
  | { readonly kind: 'turn'; readonly key: string };

export interface TutorSheetProps {
  readonly state: TutorSnapshot;
  readonly subtitle: string;
  readonly online: boolean;
  readonly onClose: () => void;
  readonly onSend: (text: string) => void;
  readonly onSendFollowUp: (followUp: FollowUpDto) => void;
  readonly onStop: () => void;
  readonly onRetry: () => void;
  readonly onNewDiscussion: () => void;
  readonly onToggleContext: (key: ContextKey) => void;
  readonly onAnswerSelfTest: (text: string) => void;
  readonly onCreateCard: () => Promise<boolean>;
  readonly onConfigureModels: () => void;
}

/** Feuille du tuteur (SCR-07, écran 05 « Cours · tuteur »). */
export function TutorSheet({
  state,
  subtitle,
  online,
  onClose,
  onSend,
  onSendFollowUp,
  onStop,
  onRetry,
  onNewDiscussion,
  onToggleContext,
  onAnswerSelfTest,
  onCreateCard,
  onConfigureModels,
}: TutorSheetProps) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ThreadItem>>(null);
  const [draft, setDraft] = useState('');
  const [selfTest, setSelfTest] = useState('');
  const [contextOpen, setContextOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [cardBusy, setCardBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [source, setSource] = useState<TutorSourceDto | null>(null);

  const items: ThreadItem[] = [
    ...state.messages.map((message) => ({
      kind: 'message' as const,
      key: message.id,
      message,
    })),
    ...(state.turn === null ? [] : [{ kind: 'turn' as const, key: 'turn' }]),
  ];

  const lastTutorKey = [...items]
    .reverse()
    .find((item) => item.kind === 'message' && item.message.role === 'tutor')?.key;

  // ET-5 — the answer is announced once complete, never at each fragment.
  const lastMessage = state.messages[state.messages.length - 1];
  const lastId = lastMessage?.id;
  const announce = lastMessage?.role === 'tutor' && !state.busy;
  useEffect(() => {
    if (announce) AccessibilityInfo.announceForAccessibility(t.announcement);
  }, [announce, lastId]);

  // ET-3 — follow the stream unless the learner scrolled up.
  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
    setAtBottom(true);
  }, []);

  const fields = state.card === null ? null : cardFieldsOf(state.card);

  const confirmCard = (): void => {
    setCardBusy(true);
    void onCreateCard()
      .then((created) => {
        setCardOpen(false);
        setToast(created ? t.cardCreated : t.cardError);
      })
      .finally(() => {
        setCardBusy(false);
      });
  };

  return (
    <View style={styles.root}>
      <Pressable
        testID="tutor-sheet-backdrop"
        accessibilityRole="button"
        accessibilityLabel={t.close}
        onPress={onClose}
        style={styles.backdrop}
      />
      <KeyboardAvoidingView
        // Android resizes the window itself (`adjustResize`) : `padding` y déplaçait la
        // saisie sous le clavier (ET-4). iOS garde `padding`, faute de redimensionnement.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.avoider}
      >
        <View
          testID="tutor-sheet"
          accessibilityViewIsModal
          style={[styles.panel, { paddingBottom: insets.bottom + theme.spacing.sm }]}
        >
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={styles.iconTile}>
              <Icon name="sparkles" size={20} color={theme.colors.lime} />
            </View>
            <View style={styles.headerTexts}>
              <Text variant="sheetTitle" testID="tutor-title">
                {t.title}
              </Text>
              <Text variant="rowSubtitle" tone="muted" testID="tutor-subtitle">
                {subtitle}
              </Text>
            </View>
            <Pressable
              testID="tutor-new-discussion"
              accessibilityRole="button"
              accessibilityLabel={t.newDiscussion}
              onPress={onNewDiscussion}
              hitSlop={theme.spacing.md}
            >
              <Icon name="more" size={20} color={theme.colors.inkMuted} />
            </Pressable>
            <Pressable
              testID="tutor-close"
              accessibilityRole="button"
              accessibilityLabel={t.close}
              onPress={onClose}
              hitSlop={theme.spacing.md}
            >
              <Icon name="x" size={20} color={theme.colors.inkMuted} />
            </Pressable>
          </View>

          <Pressable
            testID="tutor-context"
            accessibilityRole="button"
            accessibilityLabel={t.context(state.contextItems.length)}
            onPress={() => {
              setContextOpen(true);
            }}
            hitSlop={verticalHitSlop(controls.chip)}
            style={styles.contextRow}
          >
            <Icon name="book" size={13} color={theme.colors.inkMuted} />
            <Text variant="caption" tone="secondary" testID="tutor-context-count">
              {t.context(state.contextItems.length)}
            </Text>
          </Pressable>

          {state.error === null ? null : (
            <View testID="tutor-error" style={styles.error}>
              <Text variant="bodySmall" tone="danger">
                {errorMessageOf(state)}
              </Text>
              <View style={styles.errorActions}>
                {state.error.code === 'AI_MODEL_MISSING' ? (
                  <Button
                    label={t.configureModels}
                    variant="outline"
                    size="sm"
                    onPress={onConfigureModels}
                    testID="tutor-configure-models"
                  />
                ) : (
                  <Button
                    label={t.retry}
                    variant="outline"
                    size="sm"
                    onPress={onRetry}
                    testID="tutor-error-retry"
                  />
                )}
              </View>
            </View>
          )}

          <FlatList
            ref={listRef}
            testID="tutor-thread"
            data={items}
            keyExtractor={(item) => item.key}
            style={styles.thread}
            contentContainerStyle={styles.threadContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => {
              if (atBottom) listRef.current?.scrollToEnd({ animated: false });
            }}
            onScroll={(event) => {
              const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
              const distance = contentSize.height - layoutMeasurement.height - contentOffset.y;
              setAtBottom(distance < 80);
            }}
            scrollEventThrottle={16}
            ListEmptyComponent={
              state.status === 'loading' ? (
                <Text variant="bodySmall" tone="muted" testID="tutor-loading">
                  {t.historyLoading}
                </Text>
              ) : (
                <View style={styles.empty}>
                  <Text variant="bodySmall" tone="muted" testID="tutor-empty">
                    {t.empty}
                  </Text>
                  {state.suggestions.length === 0 ? null : (
                    <View style={styles.suggestions}>
                      <Text variant="label" tone="muted">
                        {t.suggestions}
                      </Text>
                      {state.suggestions.map((followUp, index) => (
                        <Chip
                          key={followUp.key}
                          tone="outline"
                          label={followUp.label}
                          testID={`tutor-suggestion-${String(index)}`}
                          onPress={() => {
                            onSendFollowUp(followUp);
                          }}
                        />
                      ))}
                    </View>
                  )}
                </View>
              )
            }
            renderItem={({ item }) => {
              if (item.kind === 'turn') {
                return <TurnBubble state={state} />;
              }
              const { message } = item;
              const isLastTutor = item.key === lastTutorKey && !state.busy;
              return (
                <MessageBubble
                  message={message}
                  index={state.messages.indexOf(message)}
                  showActions={isLastTutor}
                  card={isLastTutor && state.card !== null}
                  online={online}
                  selfTestDraft={selfTest}
                  onSelfTestDraft={setSelfTest}
                  onAnswerSelfTest={() => {
                    if (selfTest.trim() === '') return;
                    onAnswerSelfTest(selfTest);
                    setSelfTest('');
                  }}
                  onFollowUp={onSendFollowUp}
                  onCreateCard={() => {
                    setCardOpen(true);
                  }}
                  onRetry={onRetry}
                  onShowSource={setSource}
                />
              );
            }}
          />

          {atBottom ? null : (
            <Pressable
              testID="tutor-scroll-bottom"
              accessibilityRole="button"
              accessibilityLabel={t.scrollToBottom}
              onPress={scrollToBottom}
              hitSlop={theme.spacing.sm}
              style={styles.scrollBottom}
            >
              <Icon name="chevronDown" size={16} color={theme.colors.ink} />
              <Text variant="caption">{t.scrollToBottom}</Text>
            </Pressable>
          )}

          {online ? null : (
            <Text variant="caption" tone="muted" align="center" testID="tutor-offline">
              {t.offline}
            </Text>
          )}

          <Composer
            value={draft}
            onChangeText={setDraft}
            onSend={() => {
              if (draft.trim() === '') return;
              onSend(draft);
              setDraft('');
            }}
            onStop={onStop}
            busy={state.busy}
            disabled={!online || state.status !== 'ready'}
          />
          <Text variant="caption" tone="muted" align="center" testID="tutor-footnote">
            {t.footnote}
          </Text>
        </View>
      </KeyboardAvoidingView>

      <ContextSheet
        visible={contextOpen}
        items={state.contextItems}
        include={state.include}
        onToggle={onToggleContext}
        onClose={() => {
          setContextOpen(false);
        }}
      />
      <CardSheet
        visible={cardOpen}
        fields={fields}
        busy={cardBusy}
        onConfirm={confirmCard}
        onCancel={() => {
          setCardOpen(false);
        }}
      />
      <Sheet
        visible={source !== null}
        onClose={() => {
          setSource(null);
        }}
        title={t.sourceTitle}
        testID="tutor-source-sheet"
      >
        <Text variant="bodySmall" testID="tutor-source-sheet-label">
          {source?.label ?? ''}
        </Text>
        {source?.href === undefined ? null : (
          <Button
            label={t.sourceTitle}
            variant="outline"
            size="sm"
            onPress={() => {
              const href = source.href;
              setSource(null);
              if (href !== undefined) void openExternal(href).catch(() => undefined);
            }}
            testID="tutor-source-sheet-open"
          />
        )}
      </Sheet>
      <Toast
        visible={toast !== null}
        message={toast ?? ''}
        testID="tutor-toast"
        onHide={() => {
          setToast(null);
        }}
      />
    </View>
  );
}

/** Message of the error banner (EF-7). */
function errorMessageOf(state: TutorSnapshot): string {
  const error = state.error;
  if (error === null) return '';
  switch (error.code) {
    case 'AI_MODEL_MISSING':
      return t.errorModel;
    case 'AI_UNAVAILABLE':
      return t.errorUnavailable;
    case 'RATE_LIMITED':
      return t.errorRate(error.retryAfterSec ?? 30);
    default:
      return t.errorNetwork;
  }
}

interface MessageBubbleProps {
  readonly message: TutorMessageView;
  readonly index: number;
  readonly showActions: boolean;
  readonly card: boolean;
  readonly online: boolean;
  readonly selfTestDraft: string;
  readonly onSelfTestDraft: (text: string) => void;
  readonly onAnswerSelfTest: () => void;
  readonly onFollowUp: (followUp: FollowUpDto) => void;
  readonly onCreateCard: () => void;
  readonly onRetry: () => void;
  readonly onShowSource: (source: TutorSourceDto) => void;
}

/** One bubble of the thread: learner in ink, tutor on a light card (EF-3). */
function MessageBubble({
  message,
  index,
  showActions,
  card,
  online,
  selfTestDraft,
  onSelfTestDraft,
  onAnswerSelfTest,
  onFollowUp,
  onCreateCard,
  onRetry,
  onShowSource,
}: MessageBubbleProps) {
  const testID = `tutor-message-${String(index)}`;
  if (message.role === 'learner') {
    return (
      <View testID={testID} style={styles.userBubble}>
        <Text variant="bodySmall" tone="inverse">
          {message.text}
        </Text>
      </View>
    );
  }

  const interrupted = message.interrupted;
  return (
    <View testID={testID} style={styles.tutorBubble}>
      <Markdown markdown={message.text} testID={`${testID}-markdown`} />
      {message.sources.length === 0 || !showActions ? null : (
        <View style={styles.sources}>
          {message.sources.map((source, sourceIndex) => (
            <Pressable
              key={`${source.label}-${String(sourceIndex)}`}
              testID={`tutor-source-${String(sourceIndex)}`}
              accessibilityRole="button"
              accessibilityLabel={t.source(source.label)}
              onPress={() => {
                onShowSource(source);
              }}
              hitSlop={verticalHitSlop(controls.chip)}
              style={styles.sourceChip}
            >
              <Icon name="book" size={13} color={theme.colors.inkMuted} />
              <Text variant="caption" tone="secondary" numberOfLines={2} style={styles.sourceLabel}>
                {source.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {interrupted ? (
        <View style={styles.interrupted}>
          <Text variant="caption" tone="danger" testID="tutor-interrupted">
            {t.interrupted}
          </Text>
          <Pressable
            testID="tutor-retry"
            accessibilityRole="button"
            accessibilityLabel={t.retry}
            accessibilityHint={t.retryHint}
            onPress={onRetry}
            hitSlop={verticalHitSlop(controls.chip)}
          >
            <Text variant="chip" tone="indigoInk">
              {t.retry}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {message.selfTest?.status === 'pending' && showActions ? (
        <Card style={styles.selfTest} testID="tutor-self-test">
          <Text variant="label" tone="muted">
            {t.selfTestTitle}
          </Text>
          <TextInput
            testID="tutor-self-test-input"
            accessibilityLabel={t.selfTestAnswerLabel}
            placeholder={t.selfTestPlaceholder}
            placeholderTextColor={theme.colors.inkMuted}
            value={selfTestDraft}
            onChangeText={onSelfTestDraft}
            multiline
            editable={online}
            style={styles.selfTestInput}
          />
          <Button
            label={t.selfTestSubmit}
            size="sm"
            variant="ink"
            disabled={!online || selfTestDraft.trim() === ''}
            onPress={onAnswerSelfTest}
            testID="tutor-self-test-submit"
          />
        </Card>
      ) : null}
      {showActions && message.followUps.length > 0 ? (
        <View style={styles.followUps} testID="tutor-follow-ups">
          {message.followUps.map((followUp, followUpIndex) => (
            <Chip
              key={followUp.key}
              tone="outline"
              label={followUp.label}
              testID={`tutor-follow-up-${String(followUpIndex)}`}
              onPress={() => {
                onFollowUp(followUp);
              }}
            />
          ))}
          {card ? (
            <Chip
              tone="indigo"
              icon="cards"
              label={t.cardAction}
              testID="tutor-create-card"
              onPress={onCreateCard}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Bubble of the reply being written: three dots until the first fragment (EF-3). */
function TurnBubble({ state }: { readonly state: TutorSnapshot }) {
  const turn = state.turn;
  if (turn === null) return null;
  if (turn.text === '') {
    return (
      <View testID="tutor-typing" style={[styles.tutorBubble, styles.typing]}>
        <Text variant="caption" tone="muted">
          {t.typing}
        </Text>
        <View style={styles.dots}>
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
      </View>
    );
  }
  return (
    <View testID="tutor-message-live" style={styles.tutorBubble}>
      <Markdown markdown={turn.text} testID="tutor-live-markdown" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: theme.colors.overlay,
  },
  avoider: { justifyContent: 'flex-end' },
  panel: {
    maxHeight: '92%',
    minHeight: '46%',
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    ...theme.elevation.sheet,
  },
  grabber: {
    alignSelf: 'center',
    width: controls.sheetGrabber.width,
    height: controls.sheetGrabber.height,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.handle,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  iconTile: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: theme.colors.ink,
  },
  headerTexts: { flex: 1, minWidth: 0, gap: 2 },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing.xs,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.surfaceMuted,
  },
  error: {
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderRadius: radius.card,
    backgroundColor: theme.colors.dangerSoft,
  },
  errorActions: { flexDirection: 'row', gap: theme.spacing.sm },
  thread: { flexGrow: 0 },
  threadContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  empty: { gap: theme.spacing.md, paddingVertical: theme.spacing.lg },
  suggestions: { gap: theme.spacing.sm },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    marginLeft: 'auto',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 5,
    borderBottomLeftRadius: 18,
    backgroundColor: theme.colors.ink,
  },
  tutorBubble: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 18,
    backgroundColor: theme.colors.surfaceMuted,
  },
  typing: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  dots: { flexDirection: 'row', gap: theme.spacing.xs },
  dot: {
    width: 5,
    height: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.inkMuted,
  },
  sources: { gap: theme.spacing.xs },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing.xs,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
  },
  sourceLabel: { flexShrink: 1 },
  interrupted: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  selfTest: { gap: theme.spacing.sm },
  selfTestInput: {
    ...theme.type.bodySmall,
    minHeight: controls.button.md,
    padding: theme.spacing.sm,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
    color: theme.colors.ink,
  },
  followUps: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  scrollBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceMuted,
  },
});
