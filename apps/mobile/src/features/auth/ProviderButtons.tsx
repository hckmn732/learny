// « Continuer avec Apple » and « Continuer avec Google » (SPEC-3402 EF-1, CA-1, CA-4, CL-4).
//
// Order and visibility come from `auth/providers/order.ts` (iOS: Apple then Google; Android: the
// reverse; Google never without Apple). iOS draws Apple with the system button, as the App Store
// guidelines require; Android and Google use the branded controls of the mockup — a black button
// with the white Apple mark, a white button with the official four-colour Google mark.
import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
} from 'expo-apple-authentication';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { visibleProviders, type ProviderPlatform } from '../../auth/providers/order';
import type { ProviderId } from '../../auth/providers/types';
import { controls, radius, spacing, theme } from '../../theme';
import { Icon } from '../../ui/Icon';
import { Text } from '../../ui/Text';

const t = fr.mobile.auth.providers;

export interface ProviderButtonsProps {
  /** Result of `AppleAuthentication.isAvailableAsync()`; false hides the whole zone (CA-1). */
  readonly appleAvailable: boolean;
  /** Provider with a window open; every button is then disabled (CL-4). */
  readonly busy?: ProviderId | null;
  readonly disabled?: boolean;
  /** Platform of the build; injectable so the two orders are tested on one host. */
  readonly platform?: ProviderPlatform;
  readonly onSelect: (provider: ProviderId) => void;
}

/** Label announced by each provider button (EF-1). */
export function providerLabel(provider: ProviderId): string {
  return provider === 'apple' ? t.apple : t.google;
}

/** Provider zone of the sign-in screen (EF-1). */
export function ProviderButtons({
  appleAvailable,
  busy = null,
  disabled = false,
  platform = 'android',
  onSelect,
}: ProviderButtonsProps): React.ReactElement | null {
  const providers = visibleProviders(platform, appleAvailable);
  if (providers.length === 0) return null;

  return (
    <View style={styles.list} testID="auth-providers">
      {providers.map((provider) => {
        if (provider === 'apple' && platform === 'ios') {
          return (
            <AppleAuthenticationButton
              buttonStyle={AppleAuthenticationButtonStyle.BLACK}
              buttonType={AppleAuthenticationButtonType.CONTINUE}
              cornerRadius={radius.pill}
              key="apple"
              onPress={() => {
                onSelect('apple');
              }}
              style={styles.appleNative}
              testID="auth-apple"
            />
          );
        }
        return (
          <ProviderButton
            busy={busy}
            disabled={disabled}
            key={provider}
            onSelect={onSelect}
            provider={provider}
          />
        );
      })}
    </View>
  );
}

interface ProviderButtonProps {
  readonly provider: ProviderId;
  readonly busy: ProviderId | null;
  readonly disabled: boolean;
  readonly onSelect: (provider: ProviderId) => void;
}

function ProviderButton({ provider, busy, disabled, onSelect }: ProviderButtonProps) {
  const apple = provider === 'apple';
  const label = providerLabel(provider);
  const loading = busy === provider;
  const inactive = disabled || busy !== null;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: inactive }}
      disabled={inactive}
      onPress={() => {
        onSelect(provider);
      }}
      style={({ pressed }) => [
        styles.button,
        apple ? styles.apple : styles.google,
        { opacity: inactive && !loading ? 0.45 : pressed ? 0.85 : 1 },
      ]}
      testID={apple ? 'auth-apple' : 'auth-google'}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator
            color={apple ? theme.colors.white : theme.colors.ink}
            size="small"
            testID={`auth-${provider}-spinner`}
          />
        ) : (
          <Icon color={apple ? theme.colors.white : theme.colors.ink} name={provider} size={20} />
        )}
        <Text tone={apple ? 'inverse' : 'primary'} variant="button">
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md, marginTop: spacing.md },
  button: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: controls.button.md,
    paddingHorizontal: spacing.xl,
  },
  apple: { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink },
  appleNative: { height: controls.button.md, width: '100%' },
  google: { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong },
  content: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
});
