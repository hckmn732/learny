// Warm-up of the day (SPEC-3305 EF-5, BR-AUT-03; SPEC-714 EF-7, EF-8).
//
// One question at a time: « Voir la réponse » then « À revoir » / « Je savais ». A notion
// « À revoir » joins the global quiz of the evening (the server records it); the screen only shows
// the score of the first pass. Offline, the warm-up needs the network (the pack has no warm-up).
import { ScrollView, StyleSheet, View } from 'react-native';

import type { WarmupDto } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { OfflineBanner } from '../../offline/OfflineBanner';
import { theme } from '../../theme';
import { Button, Card, IconButton, ProgressBar, Text } from '../../ui';

const t = fr.mobile.reviser.warmup;

export interface WarmupViewProps {
  readonly warmup: WarmupDto;
  readonly position: number;
  readonly revealed: boolean;
  readonly pending: boolean;
  readonly online: boolean;
  readonly error: string | null;
  readonly onReveal: () => void;
  readonly onAnswer: (knew: boolean) => void;
  readonly onClose: () => void;
}

/** Screen of the warm-up (EF-5). */
export function WarmupView(props: WarmupViewProps) {
  const { warmup, position } = props;
  const item = warmup.items.find((entry) => entry.position === position) ?? warmup.items[0] ?? null;
  const answered = warmup.answers.filter((entry) => entry.position < position).length;
  const total = warmup.items.length;
  const knew = warmup.answers.filter((entry) => entry.knew).length;
  const done = warmup.status === 'done' || answered >= total;

  return (
    <View style={styles.base} testID="warmup-screen">
      <OfflineBanner />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerTexts}>
            <Text variant="eyebrow" tone="muted">
              {warmup.scope === 'yesterday_prerequisites'
                ? 'Prérequis de la veille'
                : 'Notions de la veille'}
            </Text>
            <Text variant="largeTitle" testID="warmup-title">
              {t.title}
            </Text>
          </View>
          <IconButton
            name="x"
            accessibilityLabel={t.back}
            onPress={props.onClose}
            testID="warmup-close"
          />
        </View>

        {done ? (
          <View style={styles.block}>
            <Card testID="warmup-done">
              <Text variant="eyebrow" tone="success">
                {t.done}
              </Text>
              <Text variant="sectionTitle" testID="warmup-score">
                {t.score(knew, total)}
              </Text>
              <Text variant="bodySmall" tone="secondary">
                {t.doneBody}
              </Text>
              <Button label={t.back} onPress={props.onClose} testID="warmup-back" />
            </Card>
          </View>
        ) : item === null ? (
          <View style={styles.block}>
            <Card>
              <Text variant="body">{t.empty}</Text>
            </Card>
          </View>
        ) : (
          <>
            <View style={styles.block}>
              <View style={styles.progressLine}>
                <Text variant="caption" tone="secondary" testID="warmup-progress">
                  {t.question(answered + 1, total)}
                </Text>
                <Text variant="caption" tone="muted">
                  {t.score(knew, total)}
                </Text>
              </View>
              <ProgressBar
                value={total === 0 ? 0 : (answered + 1) / total}
                label={t.question(answered + 1, total)}
              />
            </View>
            <View style={styles.block}>
              <Card testID="warmup-question-card">
                <Text variant="label" tone="muted">
                  {item.notionLabel}
                  {item.moduleNumber === null ? '' : ` · Module ${String(item.moduleNumber)}`}
                </Text>
                <Text variant="title" testID="warmup-question">
                  {item.question}
                </Text>
                {props.revealed ? (
                  <Text variant="body" tone="secondary" testID="warmup-answer">
                    {item.answer}
                  </Text>
                ) : null}
                <Button
                  label={t.show}
                  variant="outline"
                  onPress={props.onReveal}
                  disabled={props.revealed}
                  testID="warmup-reveal"
                />
              </Card>
            </View>
            <View style={styles.block}>
              <View style={styles.answers}>
                <View style={styles.answerItem}>
                  <Button
                    label={t.again}
                    variant="outline"
                    onPress={() => {
                      props.onAnswer(false);
                    }}
                    disabled={!props.online || props.pending}
                    testID="warmup-again"
                  />
                </View>
                <View style={styles.answerItem}>
                  <Button
                    label={t.knew}
                    variant="primary"
                    onPress={() => {
                      props.onAnswer(true);
                    }}
                    disabled={!props.online || props.pending}
                    testID="warmup-knew"
                  />
                </View>
              </View>
              {props.online ? null : (
                <Text variant="caption" tone="muted" testID="warmup-offline">
                  {t.offline}
                </Text>
              )}
              {props.error === null ? null : (
                <Text variant="caption" tone="danger" testID="warmup-error">
                  {props.error}
                </Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
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
  block: { paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm },
  progressLine: { flexDirection: 'row', justifyContent: 'space-between' },
  answers: { flexDirection: 'row', gap: theme.spacing.sm },
  answerItem: { flex: 1 },
});
