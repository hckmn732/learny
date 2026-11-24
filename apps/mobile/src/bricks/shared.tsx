// Shared pieces of the native brick views (SPEC-3301 § 5, § 10).
//
// One card per brick, one header (type label + stem) and three states that every view shares: the
// correction, the invalid charge (CL-2) and the web hand-off (CL-1). Keeping them here is what
// makes a single `BrickView` usable by the course, the validation quiz, the global quiz and the
// warm-up.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { BrickType } from '@learny/bricks';
import { fr } from '@learny/i18n';

import { radius, theme } from '../theme';
import { Card, Icon, Text } from '../ui';
import { Markdown } from '../ui/Markdown';

const t = fr.mobile.bricks;

/** Reference of a passage, as the public projection sends it (BR-COU-02). */
export interface SourceReference {
  readonly chunkId: string;
  readonly quote?: string | undefined;
}

/** Wrapper of every brick: the card of the mockup, one stable `testID` per type. */
export function BrickCard({
  type,
  children,
  testID,
}: {
  readonly type: BrickType;
  readonly children: ReactNode;
  readonly testID?: string | undefined;
}) {
  return (
    <Card testID={testID ?? `brick-${type}`}>
      <View style={styles.body}>{children}</View>
    </Card>
  );
}

/** Type label and stem of a question (EF-2, EF-3, EF-4). */
export function QuestionHeader({
  type,
  stem,
  instruction,
}: {
  readonly type: BrickType;
  readonly stem?: string | undefined;
  readonly instruction?: string | undefined;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.typeRow}>
        <Text variant="label" tone="muted" testID={`brick-type-${type}`}>
          {t.types[type]}
        </Text>
      </View>
      {stem === undefined || stem === '' ? null : <Markdown markdown={stem} testID="brick-stem" />}
      {instruction === undefined || instruction === '' ? null : (
        <Markdown markdown={instruction} testID="brick-instruction" />
      )}
    </View>
  );
}

/** Correction box of a code-corrected brick (BR-MEM-10, EF-2). */
export function Feedback({
  isCorrect,
  explanation,
  children,
}: {
  readonly isCorrect: boolean;
  readonly explanation?: string | null | undefined;
  readonly children?: ReactNode;
}) {
  return (
    <View
      testID="brick-feedback"
      style={[styles.feedback, isCorrect ? styles.feedbackCorrect : styles.feedbackWrong]}
    >
      <View style={styles.feedbackHeader}>
        <Icon
          name={isCorrect ? 'check' : 'alert'}
          size={16}
          color={isCorrect ? theme.colors.greenInk : theme.colors.orangeInk}
        />
        <Text variant="buttonSmall" tone={isCorrect ? 'success' : 'danger'}>
          {isCorrect ? t.exact : t.almost}
        </Text>
      </View>
      {explanation === undefined || explanation === null || explanation === '' ? null : (
        <Text variant="bodySmall" tone="secondary">
          {explanation}
        </Text>
      )}
      {children}
    </View>
  );
}

/** References of the charge, with the link to the resource (BR-COU-02). */
export function Sources({
  sources,
  resourceId,
  resourceLabel,
  onOpenResource,
}: {
  readonly sources: readonly SourceReference[];
  readonly resourceId?: string | undefined;
  readonly resourceLabel?: string | undefined;
  readonly onOpenResource?: ((resourceId: string) => void) | undefined;
}) {
  if (sources.length === 0 && resourceId === undefined) return null;
  return (
    <View style={styles.sources} testID="brick-sources">
      <Text variant="label" tone="muted">
        {t.source}
      </Text>
      {sources.map((source, index) => (
        <Text
          key={`source-${String(index)}`}
          variant="caption"
          tone="secondary"
          numberOfLines={3}
          testID={`brick-source-${String(index)}`}
        >
          {source.quote === undefined ? t.sourceExcerpt : source.quote}
        </Text>
      ))}
      {resourceId === undefined ? null : (
        <Pressable
          accessibilityHint={t.openResourceHint}
          accessibilityRole="link"
          onPress={() => {
            onOpenResource?.(resourceId);
          }}
          testID="brick-resource-link"
        >
          <Text variant="buttonSmall" tone="indigoInk">
            {resourceLabel ?? t.openResource}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** Charge refused by the mirror of its type (CL-2, BR-BRI-02): never a crash, never its content. */
export function InvalidCharge({
  type,
  testID,
}: {
  readonly type: BrickType;
  readonly testID?: string | undefined;
}) {
  return (
    <View testID={testID ?? `brick-${type}-invalid`} style={styles.invalid}>
      <Text variant="rowTitle">{t.invalidTitle}</Text>
      <Text variant="bodySmall" tone="secondary">
        {t.invalidBody}
      </Text>
    </View>
  );
}

/** Type out of the mobile scope, or unknown to this version of the application (CL-1). */
export function WebHandOff({
  type,
  onOpenWeb,
  testID,
}: {
  readonly type: string;
  readonly onOpenWeb?: (() => void) | undefined;
  readonly testID?: string | undefined;
}) {
  return (
    <Card testID={testID ?? `brick-${type}`}>
      <View style={styles.body}>
        <Text variant="rowTitle">{t.webOnlyTitle}</Text>
        <Text variant="bodySmall" tone="secondary">
          {t.webOnlyBody}
        </Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            onOpenWeb?.();
          }}
          testID="brick-web-link"
        >
          <Text variant="button" tone="indigoInk">
            {t.continueOnWeb}
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

/** A board game announces the placement it just made (ET-4). */
export function LiveRegion({ message }: { readonly message: string }) {
  return (
    <View accessibilityLiveRegion="polite" testID="brick-live">
      <Text variant="caption" tone="muted">
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: theme.spacing.md },
  header: { gap: theme.spacing.sm },
  typeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  feedback: {
    gap: theme.spacing.sm,
    borderRadius: radius.control,
    borderWidth: 1,
    padding: theme.spacing.md,
  },
  feedbackCorrect: { backgroundColor: theme.colors.greenSoft, borderColor: theme.colors.green },
  feedbackWrong: { backgroundColor: theme.colors.orangeSoft, borderColor: theme.colors.orange },
  feedbackHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  sources: { gap: theme.spacing.xs },
  invalid: {
    gap: theme.spacing.xs,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.lg,
  },
  live: { minHeight: 0 },
});
