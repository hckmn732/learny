// Sheet that sends a magic link (SPEC-3101 EF-3, ET-1, CA-4; ADR-0121).
//
// Opened by « Mot de passe oublié ? » and by « Recevoir un lien de connexion » (ADR-3003 § 2:
// no password reset exists in the product). The address is prefilled and the answer is the same
// for a known and an unknown address: « Si un compte existe pour cette adresse, un lien vient
// d'être envoyé. » (EF-3, CA-4).
import { useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { describeAuthError } from '../../auth/auth-errors';
import { requestMagicLink } from '../../auth/email-auth';
import { emailAuthClient } from '../../auth/native-auth';
import { spacing } from '../../theme';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';

import { TextField } from './TextField';
import { validateEmail } from './validation';

export interface MagicLinkSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  /** Address typed on the account form, prefilled in the sheet (EF-3). */
  readonly initialEmail: string;
  readonly testID?: string | undefined;
}

/** Bottom sheet of the magic link (EF-3). */
export function MagicLinkSheet({
  visible,
  onClose,
  initialEmail,
  testID,
}: MagicLinkSheetProps): ReactElement {
  const t = fr.mobile.auth.magic;
  const [email, setEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The parent remounts the sheet when it opens (`key`), so the address typed on the form is the
  // initial state: no state is written from an effect (react-hooks/set-state-in-effect).

  const send = async (): Promise<void> => {
    if (sending) return;
    const invalidEmail = validateEmail(email);
    if (invalidEmail !== null) {
      setError(invalidEmail);
      return;
    }
    setSending(true);
    setError(null);
    try {
      // `sent` and `silent` are deliberately indistinguishable for the learner (CA-4).
      await requestMagicLink(emailAuthClient(), email.trim());
      setSent(true);
    } catch (cause) {
      setError(describeAuthError(cause).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet
      {...(testID === undefined ? {} : { testID })}
      onClose={onClose}
      title={t.title}
      visible={visible}
    >
      <View style={styles.body}>
        <Text tone="muted" variant="bodySmall">
          {t.intro}
        </Text>
        <TextField
          autoComplete="email"
          editable={!sending && !sent}
          keyboardType="email-address"
          label={fr.auth.account.emailLabel}
          onChangeText={(value) => {
            setEmail(value);
            setError(null);
            setSent(false);
          }}
          placeholder={fr.auth.account.emailPlaceholder}
          returnKeyType="send"
          secure={false}
          testID={testID === undefined ? undefined : `${testID}-email`}
          textContentType="emailAddress"
          value={email}
        />
        {sent ? (
          <View
            accessibilityLiveRegion="polite"
            testID={testID === undefined ? undefined : `${testID}-sent`}
          >
            <Text tone="success" variant="bodySmall">
              {t.sent}
            </Text>
          </View>
        ) : null}
        {error === null ? null : (
          <View accessibilityLiveRegion="polite">
            <Text
              testID={testID === undefined ? undefined : `${testID}-error`}
              tone="danger"
              variant="bodySmall"
            >
              {error}
            </Text>
          </View>
        )}
        <Button
          block
          label={sent ? fr.mobile.ui.close : sending ? t.sending : t.send}
          loading={sending}
          onPress={() => {
            if (sent) {
              onClose();
              return;
            }
            void send();
          }}
          testID={testID === undefined ? undefined : `${testID}-submit`}
          variant="ink"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.xl },
});
