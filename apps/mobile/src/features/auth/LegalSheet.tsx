// Sheet that records the acceptance of a new version of the legal documents
// (SPEC-3101 EF-7, CL-6, BR-ACC-02, BR-PLA-05).
//
// The versions are the ones the server carried in its `422 LEGAL_ACCEPTANCE_REQUIRED` refusal: the
// learner never accepts a version the client guessed. « Plus tard » leaves the sheet open to be
// reopened by the next guarded action.
import { useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { describeAuthError } from '../../auth/auth-errors';
import { acceptLegalVersions, type LegalVersions } from '../../auth/legal';
import { spacing } from '../../theme';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';

import { openLegalPage, type LegalDocument } from './legal-browser';

export interface LegalSheetProps {
  readonly visible: boolean;
  readonly versions: LegalVersions | null;
  readonly onClose: () => void;
  /** Called once the acceptance is recorded: the refused action is then replayed (CL-6). */
  readonly onAccepted: () => void;
  readonly testID?: string | undefined;
}

/** Sheet of the missing legal acceptance (EF-7). */
export function LegalSheet({
  visible,
  versions,
  onClose,
  onAccepted,
  testID,
}: LegalSheetProps): ReactElement {
  const t = fr.mobile.auth.legalSheet;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async (): Promise<void> => {
    if (saving || versions === null) return;
    setSaving(true);
    setError(null);
    try {
      await acceptLegalVersions(versions);
      onAccepted();
    } catch (cause) {
      setError(describeAuthError(cause).message);
    } finally {
      setSaving(false);
    }
  };

  const open = (document: LegalDocument): void => {
    void openLegalPage(document);
  };

  return (
    <Sheet
      {...(testID === undefined ? {} : { testID })}
      onClose={onClose}
      title={t.title}
      visible={visible}
    >
      <View style={styles.body}>
        <Text tone="secondary" variant="bodySmall">
          {t.body}
        </Text>
        <View style={styles.links}>
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              open('cgu');
            }}
          >
            <Text tone="indigo" variant="bodySmall">
              {fr.auth.account.termsCgu}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              open('confidentialite');
            }}
          >
            <Text tone="indigo" variant="bodySmall">
              {fr.auth.account.termsPrivacy}
            </Text>
          </Pressable>
        </View>
        {error === null ? null : (
          <View accessibilityLiveRegion="polite">
            <Text tone="danger" variant="bodySmall">
              {error}
            </Text>
          </View>
        )}
        <Button
          block
          label={t.accept}
          loading={saving}
          onPress={() => {
            void accept();
          }}
          testID={testID === undefined ? undefined : `${testID}-accept`}
          variant="ink"
        />
        <Button
          block
          label={t.later}
          onPress={onClose}
          testID={testID === undefined ? undefined : `${testID}-later`}
          variant="text"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.xl },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
