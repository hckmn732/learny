// Text field of the account forms (SPEC-3101 ET-4, EF-5; canevas § 2).
//
// One component for the e-mail and the password: label associated to the input, error announced
// (`accessibilityLiveRegion` on Android, `accessibilityLabel` completed with the error), a
// minimum touch target for the « Afficher le mot de passe » button (ET-4, BR-PLA-02), and the
// keyboard chaining of the form (`returnKeyType`, `onSubmitEditing`).
import { useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { fr } from '@learny/i18n';

import { controls, radius, spacing, theme } from '../../theme';
import { Text } from '../../ui/Text';

export interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly placeholder?: string;
  readonly error?: string | null;
  /** Hides the characters and shows the « Afficher / Masquer » button (ET-4). */
  readonly secure?: boolean;
  readonly keyboardType?: KeyboardTypeOptions;
  readonly autoComplete?: 'email' | 'current-password' | 'new-password' | 'off';
  readonly textContentType?: 'emailAddress' | 'password' | 'newPassword' | 'none';
  readonly returnKeyType?: 'next' | 'go' | 'done' | 'send';
  readonly onSubmitEditing?: () => void;
  readonly editable?: boolean;
  readonly testID?: string | undefined;
}

/** Labelled input of the design system. */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  secure = false,
  keyboardType,
  autoComplete,
  textContentType,
  returnKeyType,
  onSubmitEditing,
  editable = true,
  testID,
}: TextFieldProps): ReactElement {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const hidden = error !== null && error !== undefined;
  const t = fr.mobile.auth;

  return (
    <View style={styles.container}>
      <Text tone="secondary" variant="label">
        {label}
      </Text>
      <View
        style={[
          styles.frame,
          focused ? styles.frameFocused : null,
          hidden ? styles.frameError : null,
          editable ? null : styles.frameDisabled,
        ]}
      >
        <TextInput
          {...(testID === undefined ? {} : { testID })}
          accessibilityLabel={hidden ? `${label}. ${error}` : label}
          autoCapitalize="none"
          autoCorrect={false}
          {...(autoComplete === undefined ? {} : { autoComplete })}
          editable={editable}
          keyboardType={keyboardType ?? 'default'}
          onBlur={() => {
            setFocused(false);
          }}
          onChangeText={onChangeText}
          onFocus={() => {
            setFocused(true);
          }}
          {...(onSubmitEditing === undefined ? {} : { onSubmitEditing })}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.inkMuted}
          {...(returnKeyType === undefined ? {} : { returnKeyType })}
          secureTextEntry={secure && !revealed}
          selectionColor={theme.colors.indigo}
          style={[theme.type.body, styles.input]}
          {...(textContentType === undefined ? {} : { textContentType })}
          value={value}
        />
        {secure ? (
          <Pressable
            accessibilityLabel={revealed ? t.hidePassword : t.showPassword}
            accessibilityRole="button"
            hitSlop={spacing.md}
            onPress={() => {
              setRevealed((previous) => !previous);
            }}
            style={styles.reveal}
            testID={testID === undefined ? undefined : `${testID}-reveal`}
          >
            <Text tone="indigo" variant="caption">
              {revealed ? t.hidePassword : t.showPassword}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {hidden ? (
        <View accessibilityLiveRegion="polite">
          <Text
            {...(testID === undefined ? {} : { testID: `${testID}-error` })}
            tone="danger"
            variant="caption"
          >
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  frame: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: controls.row,
    paddingHorizontal: spacing.lg,
  },
  frameDisabled: { backgroundColor: theme.colors.surfaceSubtle, opacity: 0.7 },
  frameError: { borderColor: theme.colors.danger },
  frameFocused: { borderColor: theme.colors.ink },
  input: { color: theme.colors.ink, flex: 1, paddingVertical: spacing.md },
  reveal: { paddingLeft: spacing.md },
});
