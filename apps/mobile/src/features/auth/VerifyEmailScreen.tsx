// « Vérifiez votre e-mail » screen (SPEC-3101 EF-3, BR-ACC-03, CL-5).
//
// Shown after a sign-up with a password and after a magic link, it repeats the address, explains
// which link was sent and limits the resend to once per minute: the button stays inactive with a
// countdown (CL-5), then `POST /api/v1/auth/resend` is called with the kind of link.
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { requireApiClient } from '../../api/registry';
import { describeAuthError } from '../../auth/auth-errors';
import { pendingVerification, type PendingKind } from '../../auth/pending-auth';
import { spacing, theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Text } from '../../ui/Text';

const t = fr.mobile.auth.verify;
const a = fr.auth.verify;

/** Seconds before a second resend (BR-ACC-03, CL-5). */
export const RESEND_DELAY_SEC = 60;

const BACK: Href = '/(auth)/connexion';

export interface VerifyEmailScreenProps {
  /** Address of the pending sign-up or magic link; read from the route when absent. */
  readonly email?: string | undefined;
}

/** Verification screen of the pending link (BR-ACC-03). */
export function VerifyEmailScreen({ email }: VerifyEmailScreenProps): ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ email?: string; kind?: string }>();
  const pending = pendingVerification();
  const address = (email ?? params.email ?? pending?.email ?? '').trim();
  const kind: PendingKind =
    params.kind === 'signup' || pending?.kind === 'signup' ? 'signup' : 'magic_link';

  const [remaining, setRemaining] = useState(RESEND_DELAY_SEC);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => {
      setRemaining((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [remaining]);

  const resend = async (): Promise<void> => {
    if (sending || remaining > 0 || address === '') return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      await requireApiClient().api.authResend({ body: { email: address, kind } });
      setNotice(t.resent);
      setRemaining(RESEND_DELAY_SEC);
    } catch (cause) {
      setError(describeAuthError(cause).message);
    } finally {
      setSending(false);
    }
  };

  const label =
    remaining > 0 ? t.countdown(remaining) : sending ? fr.mobile.auth.magic.sending : t.resend;

  return (
    <View
      style={[
        styles.root,
        { paddingBottom: insets.bottom + spacing.xxl, paddingTop: insets.top + spacing.xxxl },
      ]}
      testID="verify-email"
    >
      <View style={styles.body}>
        <Text variant="largeTitle">{a.title}</Text>
        <Text testID="verify-email-text" tone="secondary" variant="body">
          {t.text(address === '' ? a.unknownAddress : address)}
        </Text>
        {notice === null ? null : (
          <View accessibilityLiveRegion="polite">
            <Text testID="verify-resent" tone="success" variant="bodySmall">
              {notice}
            </Text>
          </View>
        )}
        {error === null ? null : (
          <View accessibilityLiveRegion="polite">
            <Text testID="verify-error" tone="danger" variant="bodySmall">
              {error}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.actions}>
        <Button
          block
          disabled={remaining > 0 || address === ''}
          label={label}
          loading={sending}
          onPress={() => {
            void resend();
          }}
          testID="verify-resend"
          variant="ink"
        />
        <Button
          block
          label={t.back}
          onPress={() => {
            router.replace(BACK);
          }}
          testID="verify-back"
          variant="text"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.md },
  body: { gap: spacing.lg },
  root: {
    backgroundColor: theme.colors.canvas,
    flex: 1,
    gap: spacing.xxl,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
  },
});
