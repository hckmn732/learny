// Composer of the tutor sheet (SPEC-3303 EF-5, ET-4, CL-2).
//
// Multiline field (five visible lines at most), lime send button disabled while the field is empty
// or a reply is running, and « Arrêter » while the reply streams. The field stays above the
// keyboard on both platforms: the sheet wraps it in a `KeyboardAvoidingView` and the thread keeps
// `keyboardShouldPersistTaps` so a chip stays tappable with the keyboard open.
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { fr } from '@learny/i18n';

import { controls, theme, verticalHitSlop } from '../../theme';
import { Icon } from '../../ui/Icon';
import { Text } from '../../ui/Text';

const t = fr.mobile.tutor;

/** The mockup shows five lines at most before the field scrolls. */
export const MAX_VISIBLE_LINES = 5;

export interface ComposerProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly onSend: () => void;
  readonly onStop: () => void;
  /** A reply is running: the send button becomes « Arrêter » (EF-5). */
  readonly busy: boolean;
  /** Offline or unavailable: the field is read-only (CL-4). */
  readonly disabled?: boolean;
  readonly testIDPrefix?: string;
}

/** Field and actions of the discussion. */
export function Composer({
  value,
  onChangeText,
  onSend,
  onStop,
  busy,
  disabled = false,
  testIDPrefix = 'tutor',
}: ComposerProps) {
  const lineHeight = theme.type.bodySmall.lineHeight ?? 21;
  const paddingHeight = theme.spacing.md * 2;
  const maxHeight = lineHeight * MAX_VISIBLE_LINES + paddingHeight;
  const [height, setHeight] = useState(lineHeight + paddingHeight);
  const empty = value.trim() === '';
  const sendDisabled = empty || busy || disabled;

  return (
    <View style={styles.row}>
      <View style={styles.field}>
        <TextInput
          testID={`${testIDPrefix}-input`}
          accessibilityLabel={t.inputLabel}
          placeholder={t.placeholder}
          placeholderTextColor={theme.colors.inkMuted}
          value={value}
          onChangeText={onChangeText}
          editable={!disabled}
          multiline
          scrollEnabled={height >= maxHeight}
          textAlignVertical="top"
          onContentSizeChange={(event) => {
            const next = event.nativeEvent.contentSize.height + theme.spacing.sm;
            setHeight(Math.min(maxHeight, Math.max(lineHeight + paddingHeight, next)));
          }}
          style={[styles.input, { height }]}
        />
        {busy ? (
          <Pressable
            testID={`${testIDPrefix}-stop`}
            accessibilityRole="button"
            accessibilityLabel={t.stop}
            onPress={onStop}
            hitSlop={verticalHitSlop(controls.button.sm)}
            style={styles.stop}
          >
            <Text variant="buttonSmall" tone="inverse">
              {t.stop}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            testID={`${testIDPrefix}-send`}
            accessibilityRole="button"
            accessibilityLabel={t.send}
            accessibilityState={{ disabled: sendDisabled, busy }}
            disabled={sendDisabled}
            onPress={onSend}
            hitSlop={verticalHitSlop(controls.iconButton)}
            style={[styles.send, sendDisabled ? styles.sendIdle : null]}
          >
            <Icon name="send" size={16} color={theme.colors.ink} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: theme.spacing.lg },
  // `.composer` de la maquette : bordure ligne-2, rayon 999, blanc, padding 8/8/8/14.
  field: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
    paddingLeft: theme.spacing.lg,
    paddingRight: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
  },
  input: {
    ...theme.type.bodySmall,
    flex: 1,
    minWidth: 0,
    padding: 0,
    color: theme.colors.ink,
  },
  // `.send` : pastille citron de 36 avec l'icône encre.
  send: {
    width: controls.iconButton,
    height: controls.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.lime,
  },
  sendIdle: { opacity: 0.45 },
  stop: {
    minHeight: controls.button.sm,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.ink,
  },
});
