// Champs de saisie des écrans d'évaluation (zone C).
//
// L'application n'a pas de `TextField` dans `src/ui` (le web en a un) : ce composant local reprend
// les jetons du thème — encre, bordure, rayon de contrôle et cible tactile — pour que les écrans de
// la zone n'écrivent ni couleur ni police. Il n'est pas exporté hors de `features/mr/evaluation`.
import { StyleSheet, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { theme } from '../../../theme';
import { Text } from '../../../ui/Text';

export interface FieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly testID?: string | undefined;
  readonly placeholder?: string | undefined;
  readonly hint?: string | undefined;
  readonly secureTextEntry?: boolean | undefined;
  readonly multiline?: boolean | undefined;
  readonly maxLength?: number | undefined;
  readonly keyboardType?: KeyboardTypeOptions | undefined;
  readonly autoCapitalize?: 'none' | 'sentences' | undefined;
  readonly editable?: boolean | undefined;
}

/** Libellé au-dessus d'un champ, valeur, aide éventuelle. */
export function Field({
  label,
  value,
  onChangeText,
  testID,
  placeholder,
  hint,
  secureTextEntry = false,
  multiline = false,
  maxLength,
  keyboardType,
  autoCapitalize = 'sentences',
  editable = true,
}: FieldProps) {
  return (
    <View style={styles.container}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <TextInput
        {...(testID === undefined ? {} : { testID })}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        {...(placeholder === undefined ? {} : { placeholder })}
        {...(maxLength === undefined ? {} : { maxLength })}
        {...(keyboardType === undefined ? {} : { keyboardType })}
        placeholderTextColor={theme.colors.inkMuted}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        editable={editable}
        style={[styles.input, multiline ? styles.multiline : null]}
      />
      {hint === undefined ? null : (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing.xs },
  input: {
    minHeight: theme.controls.button.md,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    color: theme.colors.ink,
    ...theme.type.body,
  },
  multiline: { minHeight: 132, textAlignVertical: 'top' },
});