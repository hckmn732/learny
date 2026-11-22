// Callback route of the mobile application (SPEC-3101 EF-6, EF-7, CL-3, CL-4; ADR-3008 § 4).
//
// The route receives every link that opens the application: `learny://auth/callback?code=…`, the
// e-mailed `/api/v1/auth/callback?token_hash=…&type=…` intercepted by the platform, and the
// `https://<web>/auth/mobile?code=…` universal link. It exchanges the link for a session, then
// redirects: a missing legal acceptance opens its sheet (EF-7), anything else goes to the shell
// of SPEC-3102. An expired or already used link shows « Ce lien n'est plus valide. » (CA-3).
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { describeAuthError } from '../../auth/auth-errors';
import { parseAuthLink } from '../../auth/deep-link';
import { exchangeMagicCode, verifyMagicLink } from '../../auth/email-auth';
import { emailAuthClient } from '../../auth/native-auth';
import { clearPendingVerification } from '../../auth/pending-auth';
import { useSession } from '../../auth/session';
import { spacing, theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Text } from '../../ui/Text';

import { LegalSheet } from './LegalSheet';
import { useLegalGate } from './use-legal-gate';

const t = fr.mobile.auth.callback;

const SHELL: Href = '/(app)/aujourdhui';
const SIGN_IN: Href = '/(auth)/connexion';

type State = 'working' | 'invalid';

/** Route `auth/callback` (EF-6). */
export function CallbackScreen(): ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const legalGate = useLegalGate();
  const params = useLocalSearchParams();
  const initialLink = parseAuthLink(params);
  const [state, setState] = useState<State>(initialLink.kind === 'invalid' ? 'invalid' : 'working');
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const link = parseAuthLink(params);
    // An unusable link is already rendered as invalid: nothing is written from the effect.
    if (link.kind === 'invalid') return;

    void (async () => {
      try {
        // CL-4 — a link of another account closes and purges the current session first.
        if (session.status === 'signedIn') await session.signOut();
        const client = emailAuthClient();
        if (link.kind === 'code') await exchangeMagicCode(client, link.code);
        else await verifyMagicLink(client, link.tokenHash, link.type);
        clearPendingVerification();
        router.replace(SHELL);
      } catch (error) {
        const failure = describeAuthError(error);
        setMessage(failure.message);
        setState('invalid');
      }
    })();
  }, [params, router, session]);

  const invalid = state === 'invalid';

  return (
    <View
      style={[
        styles.root,
        { paddingBottom: insets.bottom + spacing.xxl, paddingTop: insets.top + spacing.xxxl },
      ]}
      testID="auth-callback"
    >
      <View style={styles.body}>
        {invalid ? (
          <>
            <Text testID="auth-callback-error" variant="largeTitle">
              {t.invalid}
            </Text>
            {message === null ? null : (
              <Text tone="muted" variant="bodySmall">
                {message}
              </Text>
            )}
          </>
        ) : (
          <>
            <Text variant="largeTitle">{t.opening}</Text>
            <ActivityIndicator color={theme.colors.ink} />
          </>
        )}
      </View>
      {invalid ? (
        <View style={styles.actions}>
          <Button
            block
            label={t.askNew}
            onPress={() => {
              router.replace({ pathname: '/(auth)/connexion', params: { magic: '1' } });
            }}
            testID="auth-callback-ask"
            variant="ink"
          />
          <Button
            block
            label={t.back}
            onPress={() => {
              router.replace(SIGN_IN);
            }}
            testID="auth-callback-back"
            variant="text"
          />
        </View>
      ) : null}

      <LegalSheet
        onAccepted={legalGate.accepted}
        onClose={legalGate.dismiss}
        testID="auth-legal-sheet"
        versions={legalGate.versions}
        visible={legalGate.versions !== null}
      />
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
