// Cadrage avec le tuteur (zone B, maquette design/app-mobile-rattrapage/ecrans/Cadrage.dc.html).
//
// Premier écran de la création : le champ du sujet crée la formation (`POST /formations`), puis la
// conversation continue sur les messages du cadrage. Les réponses rapides du tuteur sont des
// boutons ; une question à choix multiple se sélectionne puis s'envoie avec la barre de réponse.
// Le cadrage terminé propose le programme (`POST /formations/:fid/cadrage/complete`).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CadrageMessage, CadrageSuggestion } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { theme } from '../../../theme';
import { Button } from '../../../ui/Button';
import { ErrorState } from '../../../ui/ErrorState';
import { Icon } from '../../../ui/Icon';
import { IconButton } from '../../../ui/IconButton';
import { Skeleton } from '../../../ui/Skeleton';
import { Text } from '../../../ui/Text';
import { Toast } from '../../../ui/Toast';

import { CreationProgress } from './CreationProgress';
import { useCadrage } from './use-cadrage';

const t = fr.mr.creation.cadrage;

function errorMessage(code: string): string {
  const errors = t.errors as Readonly<Record<string, string>>;
  return errors[code] ?? t.errors.GENERIC;
}

/** Sélections puis texte libre, joints comme le message stocké par le serveur (EF-7 du web). */
function composeReply(labels: readonly string[], text: string): string {
  const trimmed = text.trim();
  const selected = labels.join(', ');
  if (selected === '') return trimmed;
  return trimmed === '' ? selected : `${selected}. ${trimmed}`;
}

function Bubble({ message }: Readonly<{ message: CadrageMessage }>) {
  if (message.role === 'learner') {
    return (
      <View style={styles.learnerBubble} testID={`qf-cadrage-message-${message.id}`}>
        <Text variant="bodySmall" tone="inverse">
          {message.content}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.tutorBubble} testID={`qf-cadrage-message-${message.id}`}>
      {message.questionNumber === null ? null : (
        <Text variant="caption" tone="muted">
          {t.questionLabel(message.questionNumber)}
        </Text>
      )}
      <Text variant="bodySmall">{message.content}</Text>
    </View>
  );
}

function SuggestionButton({
  suggestion,
  index,
  selected,
  onPress,
}: Readonly<{
  suggestion: CadrageSuggestion;
  index: number;
  selected: boolean;
  onPress: () => void;
}>) {
  return (
    <Pressable
      testID={`qf-cadrage-suggestion-${String(index)}`}
      accessibilityRole="button"
      accessibilityLabel={suggestion.label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.suggestion, selected ? styles.suggestionSelected : null]}
    >
      <Text variant="rowTitle" tone={selected ? 'indigoInk' : 'primary'}>
        {suggestion.label}
      </Text>
      {suggestion.description === null ? null : (
        <Text variant="caption" tone={selected ? 'indigoInk' : 'muted'}>
          {suggestion.description}
        </Text>
      )}
    </Pressable>
  );
}

/** Écran de cadrage d'une nouvelle formation. */
export function CadrageScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ fid?: string }>();
  const [fid, setFid] = useState<string | null>(
    typeof params.fid === 'string' && params.fid !== '' ? params.fid : null,
  );
  const cadrage = useCadrage(fid);
  const [subject, setSubject] = useState('');
  const [reply, setReply] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const state = cadrage.state;
  const pending = state?.pendingQuestion ?? null;
  const pendingMessage =
    pending === null || state === null
      ? undefined
      : state.messages.find((message) => message.id === pending.messageId);
  const suggestions: readonly CadrageSuggestion[] = pendingMessage?.suggestions ?? [];
  const multi = pending?.multi ?? false;
  const questionNumber = pendingMessage?.questionNumber ?? state?.questionsAsked ?? 0;
  const answered = state?.questionsAsked ?? 0;
  const labels = new Map(suggestions.map((suggestion) => [suggestion.value, suggestion.label]));

  const close = (): void => {
    if (router.canGoBack()) router.back();
    else router.replace('/programme');
  };

  const start = async (): Promise<void> => {
    const created = await cadrage.create(subject);
    if (created === null) return;
    setSubject('');
    setFid(created);
  };

  const submit = (): void => {
    if (cadrage.sending || state === null) return;
    const trimmed = reply.trim();
    const values = [...selected];
    if (values.length > 0 && trimmed !== '') {
      void cadrage.send({
        content: composeReply(
          values.map((value) => labels.get(value) ?? value),
          trimmed,
        ),
      });
    } else if (values.length > 0) {
      void cadrage.send({ selections: values });
    } else if (trimmed !== '') {
      void cadrage.send({ content: trimmed });
    } else {
      return;
    }
    setReply('');
    setSelected(new Set());
  };

  const pick = (label: string): void => {
    void cadrage.send({ content: label });
    setReply('');
    setSelected(new Set());
  };

  const toggle = (value: string): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const generate = async (): Promise<void> => {
    const outcome = await cadrage.complete();
    if (outcome.ok && fid !== null) router.replace(`/programme/proposition/${fid}`);
  };

  const code = cadrage.errorCode ?? state?.error?.code ?? null;
  const retry =
    code === 'AI_TASK_FAILED'
      ? () => {
          void cadrage.retryTutor();
        }
      : code === 'NETWORK_ERROR'
        ? () => {
            void cadrage.retryLast();
          }
        : undefined;

  const sendDisabled = cadrage.sending || (reply.trim() === '' && selected.size === 0);

  return (
    <KeyboardAvoidingView
      testID="qf-cadrage"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { paddingTop: insets.top + theme.spacing.sm }]}
    >
      <View style={styles.header}>
        <IconButton
          name="close"
          accessibilityLabel={t.close}
          onPress={close}
          testID="qf-cadrage-close"
        />
        <View style={styles.headerText}>
          <Text variant="label" tone="secondary" numberOfLines={1}>
            {questionNumber === 0 ? t.eyebrow : t.questionProgress(questionNumber)}
          </Text>
          <CreationProgress
            filled={answered}
            label={t.progressLabel}
            testID="qf-cadrage-progress"
          />
        </View>
      </View>

      {cadrage.status === 'error' ? (
        <View style={styles.state}>
          <ErrorState
            title={t.errorTitle}
            onRetry={cadrage.refresh}
            testID="qf-cadrage-load-error"
          />
        </View>
      ) : null}

      {cadrage.status === 'loading' ? (
        <View style={styles.state} testID="qf-cadrage-loading">
          <Skeleton animated={false} />
          <Skeleton animated={false} width="80%" />
          <Skeleton animated={false} width="60%" />
        </View>
      ) : null}

      {cadrage.status === 'ready' ? (
        <ScrollView
          ref={scrollRef}
          style={styles.thread}
          contentContainerStyle={styles.threadContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            scrollRef.current?.scrollToEnd({ animated: true });
          }}
        >
          {state === null ? (
            <View style={styles.tutorBubble} testID="qf-cadrage-welcome">
              <Text variant="bodySmall">{t.welcome}</Text>
            </View>
          ) : (
            state.messages.map((message) => <Bubble key={message.id} message={message} />)
          )}

          {multi && suggestions.length > 0 ? (
            <Text variant="caption" tone="muted">
              {t.suggestionsLabel}
            </Text>
          ) : null}
          {suggestions.length > 0 ? (
            <View style={styles.suggestions}>
              {suggestions.map((suggestion, index) => (
                <SuggestionButton
                  key={suggestion.value}
                  suggestion={suggestion}
                  index={index}
                  selected={multi && selected.has(suggestion.value)}
                  onPress={() => {
                    if (multi) toggle(suggestion.value);
                    else pick(suggestion.label);
                  }}
                />
              ))}
            </View>
          ) : null}

          {cadrage.sending ? (
            <View style={styles.typing} testID="qf-cadrage-typing">
              <Text variant="caption" tone="muted">
                {t.thinking}
              </Text>
            </View>
          ) : null}

          {code === null ? null : (
            <View style={styles.error} testID="qf-cadrage-error">
              <Text variant="caption" tone="danger">
                {errorMessage(code)}
              </Text>
              {retry === undefined ? null : (
                <Button
                  label={t.retry}
                  variant="outline"
                  size="sm"
                  onPress={retry}
                  testID="qf-cadrage-retry"
                />
              )}
            </View>
          )}

          {state !== null && (state.finished || state.canGenerate) ? (
            <View style={styles.generate} testID="qf-cadrage-finished">
              <Text variant="caption" tone="secondary">
                {t.finished}
              </Text>
              <Button
                label={cadrage.completing ? t.preparing : t.generate}
                loading={cadrage.completing}
                onPress={() => {
                  void generate();
                }}
                testID="qf-cadrage-generate"
              />
            </View>
          ) : null}
        </ScrollView>
      ) : null}

      {cadrage.status === 'ready' ? (
        <View style={[styles.composer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
          {fid === null ? (
            <>
              <TextInput
                testID="qf-cadrage-subject"
                accessibilityLabel={t.subjectPlaceholder}
                placeholder={t.subjectPlaceholder}
                placeholderTextColor={theme.colors.inkMuted}
                value={subject}
                onChangeText={setSubject}
                maxLength={120}
                returnKeyType="send"
                onSubmitEditing={() => {
                  void start();
                }}
                style={styles.input}
              />
              {cadrage.errorCode === 'SUBJECT_EMPTY' ? (
                <Text variant="caption" tone="danger" testID="qf-cadrage-subject-error">
                  {t.subjectEmpty}
                </Text>
              ) : null}
              <Button
                testID="qf-cadrage-start"
                label={cadrage.creating ? t.creating : t.start}
                loading={cadrage.creating}
                block
                onPress={() => {
                  void start();
                }}
              />
            </>
          ) : (
            <View style={styles.composerRow}>
              <TextInput
                testID="qf-cadrage-input"
                accessibilityLabel={t.replyLabel}
                placeholder={t.replyPlaceholder}
                placeholderTextColor={theme.colors.inkMuted}
                value={reply}
                onChangeText={setReply}
                maxLength={1000}
                returnKeyType="send"
                onSubmitEditing={submit}
                style={[styles.input, styles.inputRow]}
              />
              <IconButton
                name="mic"
                accessibilityLabel={t.dictation}
                onPress={() => {
                  setToast(t.dictationUnavailable);
                }}
                testID="qf-cadrage-dictate"
              />
              <Pressable
                testID="qf-cadrage-send"
                accessibilityRole="button"
                accessibilityLabel={t.send}
                accessibilityState={{ disabled: sendDisabled, busy: cadrage.sending }}
                disabled={sendDisabled}
                onPress={submit}
                style={[styles.send, sendDisabled ? styles.sendIdle : null]}
              >
                <Icon name="send" size={20} color={theme.colors.ink} />
              </Pressable>
            </View>
          )}
        </View>
      ) : null}

      <Toast
        visible={toast !== null}
        message={toast ?? ''}
        onHide={() => {
          setToast(null);
        }}
        testID="qf-cadrage-toast"
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  headerText: { flex: 1, gap: theme.spacing.sm },
  state: { padding: theme.spacing.xl, gap: theme.spacing.sm },
  thread: { flex: 1 },
  threadContent: {
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  tutorBubble: {
    alignSelf: 'flex-start',
    maxWidth: '88%',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    backgroundColor: theme.colors.surface,
  },
  learnerBubble: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: 18,
    borderBottomRightRadius: 6,
    backgroundColor: theme.colors.ink,
  },
  suggestions: { gap: theme.spacing.sm },
  suggestion: {
    minHeight: 48,
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.option,
    backgroundColor: theme.colors.surface,
  },
  suggestionSelected: {
    borderWidth: 2,
    borderColor: theme.colors.indigo,
    backgroundColor: theme.colors.indigoSoft,
  },
  typing: {
    alignSelf: 'flex-start',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    backgroundColor: theme.colors.surfaceMuted,
  },
  error: {
    gap: theme.spacing.sm,
    alignItems: 'flex-start',
    padding: theme.spacing.lg,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: theme.colors.orange,
    backgroundColor: theme.colors.orangeSoft,
  },
  generate: {
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
  },
  composer: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    backgroundColor: theme.colors.surface,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  input: {
    ...theme.type.bodySmall,
    minHeight: theme.minTouchTarget.height,
    paddingHorizontal: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSubtle,
    color: theme.colors.ink,
  },
  inputRow: { flex: 1, minWidth: 0 },
  send: {
    width: theme.minTouchTarget.width,
    height: theme.minTouchTarget.height,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.lime,
  },
  sendIdle: { opacity: 0.45 },
});