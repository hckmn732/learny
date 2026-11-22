// Account screen of the mobile application (SPEC-3101 EF-1 to EF-5, EF-7; ADR-0007, ADR-0121,
// ADR-3003 § 2).
//
// One screen for the two modes of the mockup (`welcome`), reached by `(auth)/connexion` and
// `(auth)/inscription`: segmented control, e-mail and password, strength indicator and terms case
// at sign-up, « Mot de passe oublié ? » and magic link sheet, legal footer, and the redirect of
// EF-7. The magic-link buttons never show whether an account exists (ADR-0121, CA-4).
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState, type ReactElement } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { requireApiClient } from '../../api/registry';
import { describeAuthError } from '../../auth/auth-errors';
import { readDemoCredentials } from '../../auth/demo-credentials';
import { signInWithPassword } from '../../auth/email-auth';
import { emailAuthClient } from '../../auth/native-auth';
import { rememberPendingVerification } from '../../auth/pending-auth';
import { radius, spacing, theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Segmented } from '../../ui/Segmented';
import { Text } from '../../ui/Text';

import { Checkbox } from './Checkbox';
import { openLegalPage } from './legal-browser';
import { LegalSheet } from './LegalSheet';
import { MagicLinkSheet } from './MagicLinkSheet';
import { StrengthMeter } from './StrengthMeter';
import { TextField } from './TextField';
import { useLegalGate } from './use-legal-gate';
import {
  fieldErrorFromApi,
  validateLogin,
  validateSignup,
  type AuthField,
  type FieldErrors,
} from './validation';

export type AuthMode = 'login' | 'signup';

export interface AuthScreenProps {
  readonly mode: AuthMode;
}

const t = fr.mobile.auth;
const a = fr.auth;

/** Shell screen of SPEC-3102: the account screen lands there once the session exists (EF-7). */
const SHELL: Href = '/(app)/aujourdhui';

/** Connexion / inscription screen (EF-1, EF-2). */
export function AuthScreen({ mode }: AuthScreenProps): ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const legalGate = useLegalGate();
  const params = useLocalSearchParams<{ magic?: string }>();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [magicOpen, setMagicOpen] = useState(params.magic === '1');

  const signup = mode === 'signup';
  const submitLabel = signup ? a.submit.signupPassword : a.submit.loginPassword;
  const busyLabel = signup ? t.submitBusySignup : t.submitBusyLogin;
  // Test builds only: the credentials of the seeded account come from the build environment
  // (`EXPO_PUBLIC_SDD_DEMO_*`, never committed); the flow of CA-1 uses this button.
  const demo = readDemoCredentials();

  const clearError = (field: AuthField): void => {
    setFieldErrors((previous) => {
      const next: FieldErrors = {};
      for (const key of ['email', 'password', 'termsAccepted'] as const) {
        const message = previous[key];
        if (key !== field && message !== undefined) next[key] = message;
      }
      return next;
    });
    if (globalError !== null) setGlobalError(null);
  };

  const fail = (error: unknown): void => {
    const field = fieldErrorFromApi(error);
    if (field !== null) {
      setFieldErrors({ [field.field]: field.message });
      return;
    }
    setGlobalError(describeAuthError(error).message);
  };

  const signIn = async (address: string, secret: string): Promise<void> => {
    try {
      await signInWithPassword(emailAuthClient(), address, secret);
      router.replace(SHELL);
    } catch (error) {
      if (describeAuthError(error).kind === 'emailNotConfirmed') {
        rememberPendingVerification(address, 'signup');
        router.replace({ pathname: '/(auth)/verifier-email', params: { email: address } });
        return;
      }
      fail(error);
    }
  };

  const create = async (address: string, secret: string): Promise<void> => {
    try {
      await requireApiClient().api.authSignUp({
        body: { email: address, password: secret, acceptedTerms: true },
      });
      rememberPendingVerification(address, 'signup');
      router.replace({ pathname: '/(auth)/verifier-email', params: { email: address } });
    } catch (error) {
      if (
        legalGate.handle(error, () => {
          void create(address, secret);
        })
      )
        return;
      fail(error);
    }
  };

  const submit = async (): Promise<void> => {
    if (submitting) return; // CL-1 — a second press never sends a second request.
    setGlobalError(null);
    setFieldErrors({});

    const checked = signup
      ? validateSignup({ email, password, termsAccepted })
      : validateLogin({ email, password });
    if (!checked.ok) {
      setFieldErrors(checked.errors);
      return;
    }

    setSubmitting(true);
    try {
      if (signup) await create(checked.values.email, checked.values.password);
      else await signIn(checked.values.email, checked.values.password);
    } finally {
      setSubmitting(false);
    }
  };

  const submitDemo = async (): Promise<void> => {
    if (submitting || demo === null) return;
    setEmail(demo.email);
    setPassword(demo.password);
    setTermsAccepted(true);
    setFieldErrors({});
    setGlobalError(null);
    setSubmitting(true);
    try {
      await signIn(demo.email, demo.password);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxxl }]}
          keyboardShouldPersistTaps="handled"
          testID="auth-screen"
        >
          <View style={styles.brand}>
            <View style={styles.brandTile}>
              <Text tone="limeInk" variant="caption">
                L
              </Text>
            </View>
            <Text variant="sectionTitle">{a.layout.label}</Text>
          </View>

          <View style={styles.headings}>
            <Text testID="auth-title" variant="largeTitle">
              {signup ? t.titleSignup : t.titleLogin}
            </Text>
            <Text tone="secondary" variant="body">
              {signup ? t.ledeSignup : t.ledeLogin}
            </Text>
          </View>

          <Segmented
            label={t.modeLabel}
            onChange={(value) => {
              const next: AuthMode = value === 'signup' ? 'signup' : 'login';
              if (next === mode) return;
              setFieldErrors({});
              setGlobalError(null);
              router.replace(next === 'signup' ? '/(auth)/inscription' : '/(auth)/connexion');
            }}
            options={[
              { value: 'login', label: t.modeLogin },
              { value: 'signup', label: t.modeSignup },
            ]}
            testID="auth-mode"
            value={mode}
          />

          <View style={styles.fields}>
            <TextField
              autoComplete="email"
              editable={!submitting}
              keyboardType="email-address"
              label={a.account.emailLabel}
              onChangeText={(value) => {
                setEmail(value);
                clearError('email');
              }}
              placeholder={a.account.emailPlaceholder}
              returnKeyType="next"
              testID="auth-email"
              textContentType="emailAddress"
              value={email}
              error={fieldErrors.email ?? null}
            />
            <TextField
              autoComplete={signup ? 'new-password' : 'current-password'}
              editable={!submitting}
              error={fieldErrors.password ?? null}
              label={a.account.passwordLabel}
              onChangeText={(value) => {
                setPassword(value);
                clearError('password');
              }}
              onSubmitEditing={() => {
                void submit();
              }}
              placeholder={a.account.passwordPlaceholder}
              returnKeyType="go"
              secure
              testID="auth-password"
              textContentType={signup ? 'newPassword' : 'password'}
              value={password}
            />
            {signup ? <StrengthMeter password={password} testID="auth-strength" /> : null}
          </View>

          <View style={styles.hintRow}>
            <Text tone="muted" variant="caption">
              {t.sessionSecure}
            </Text>
            {signup ? (
              <Text tone="muted" variant="caption">
                {t.passwordMin}
              </Text>
            ) : (
              <Pressable
                accessibilityRole="link"
                onPress={() => {
                  setMagicOpen(true);
                }}
                testID="auth-forgot"
              >
                <Text tone="indigo" variant="caption">
                  {t.forgot}
                </Text>
              </Pressable>
            )}
          </View>

          {signup ? (
            <View style={styles.terms}>
              <Checkbox
                checked={termsAccepted}
                error={fieldErrors.termsAccepted ?? null}
                label={t.termsLabel}
                onChange={(value) => {
                  setTermsAccepted(value);
                  clearError('termsAccepted');
                }}
                testID="auth-terms-checkbox"
              />
              <View style={styles.legalLinks}>
                <Pressable
                  accessibilityRole="link"
                  onPress={() => {
                    void openLegalPage('cgu');
                  }}
                  testID="auth-legal-cgu"
                >
                  <Text tone="indigo" variant="caption">
                    {a.account.termsCgu}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="link"
                  onPress={() => {
                    void openLegalPage('confidentialite');
                  }}
                  testID="auth-legal-privacy"
                >
                  <Text tone="indigo" variant="caption">
                    {a.account.termsPrivacy}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {globalError === null ? null : (
            <View accessibilityLiveRegion="polite">
              <Text testID="auth-error" tone="danger" variant="bodySmall">
                {globalError}
              </Text>
            </View>
          )}

          <Button
            block
            disabled={signup && !termsAccepted}
            label={submitting ? busyLabel : submitLabel}
            loading={submitting}
            onPress={() => {
              void submit();
            }}
            testID="auth-submit"
          />

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text tone="muted" variant="caption">
              {t.divider}
            </Text>
            <View style={styles.dividerLine} />
          </View>

          <Button
            block
            disabled={submitting}
            label={a.submit.loginMagic}
            onPress={() => {
              setMagicOpen(true);
            }}
            testID="auth-magic-link"
            variant="outline"
          />

          {signup ? null : (
            <Text align="center" tone="muted" variant="caption">
              {`${a.account.termsBefore}${a.account.termsCgu}${a.account.termsAnd}${a.account.termsPrivacy}${a.account.termsAfter}`}
            </Text>
          )}

          {demo === null ? null : (
            <Button
              block
              label={t.demoSignIn}
              onPress={() => {
                void submitDemo();
              }}
              testID="auth-demo-signin"
              variant="text"
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <MagicLinkSheet
        initialEmail={email}
        key={magicOpen ? `magic-${email}` : 'magic-closed'}
        onClose={() => {
          setMagicOpen(false);
        }}
        testID="auth-magic-sheet"
        visible={magicOpen}
      />

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
  brand: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  brandTile: {
    alignItems: 'center',
    backgroundColor: theme.colors.ink,
    borderRadius: radius.control,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  content: { gap: spacing.xl, paddingHorizontal: spacing.xxl, paddingTop: spacing.xxxl },
  dividerLine: { backgroundColor: theme.colors.divider, flex: 1, height: 1 },
  dividerRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  fields: { gap: spacing.lg },
  flex: { flex: 1 },
  headings: { gap: spacing.sm },
  hintRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  legalLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    paddingLeft: spacing.xxxl,
  },
  root: { backgroundColor: theme.colors.canvas, flex: 1 },
  terms: { gap: spacing.sm },
});
