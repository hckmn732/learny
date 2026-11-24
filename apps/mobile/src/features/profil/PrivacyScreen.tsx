// Écran Données et confidentialité (SPEC-3401 EF-3, EF-6, CL-3 ; BR-ACC-10, BR-ACC-11).
//
// « Exporter mes données » requests the archive of SPEC-211 and polls its state until the signed
// link exists, which then opens in the browser of the platform; while an export is queued or
// running no second request is made (CL-3). « Supprimer mon compte » requires the word « SUPPRIMER »
// (EF-6), recalls the thirty-day delay and the cancellation, and offers « Annuler la suppression »
// as long as the deadline is ahead (BR-ACC-11).
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { messageFor } from '../../api/errors';
import { useDeletion, useExportRequest, useExportState, useProfile } from '../../data/profile';
import { formatUserDate } from '../../lib/dates';
import { openExternal } from '../../lib/web';
import { useOnlineStatus } from '../../offline/network';
import { theme } from '../../theme';
import { Button } from '../../ui/Button';
import { ErrorState } from '../../ui/ErrorState';
import { Skeleton } from '../../ui/Skeleton';
import { Text } from '../../ui/Text';
import { Toast } from '../../ui/Toast';
import { TextField } from '../auth/TextField';

import { SettingsScaffold, SettingsSection } from './SettingsScaffold';

const t = fr.mobile.profile.privacy;

/** « 1,2 Mo » — size of the archive, as the web shows it (BR-ACC-10). */
export function sizeLabel(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return '—';
  const units = ['o', 'Ko', 'Mo', 'Go'] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? String(Math.round(value)) : value.toFixed(1).replace('.', ',');
  return `${rounded} ${units[unit] ?? 'o'}`;
}

/** Route body of `/profil/confidentialite`. */
export function PrivacyScreen() {
  const router = useRouter();
  const online = useOnlineStatus();
  const profile = useProfile();
  const deletion = useDeletion();
  const requester = useExportRequest();
  const [exportId, setExportId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stored = profile.data?.export ?? null;
  // CL-3 — the export the screen shows is the one it just requested, else the last one of the
  // profile: no state is copied from the server, so a reload never shows a stale archive.
  const current = exportId ?? stored?.id ?? null;
  const exported = useExportState(current);
  const status = exported.data?.status ?? stored?.status ?? null;
  const busy = status === 'queued' || status === 'running';

  const close = (): void => {
    router.back();
  };

  if (profile.status === 'error') {
    return (
      <SettingsScaffold
        title={t.title}
        testID="privacy-screen"
        onBack={close}
        toast={
          <Toast
            testID="privacy-toast"
            visible={toast !== null}
            message={toast ?? ''}
            onHide={() => {
              setToast(null);
            }}
          />
        }
      >
        <ErrorState title={t.errorTitle} onRetry={profile.refetch} testID="privacy-error" />
      </SettingsScaffold>
    );
  }

  if (profile.data === null) {
    return (
      <SettingsScaffold title={t.title} testID="privacy-screen" onBack={close}>
        <Skeleton animated={false} />
        <Skeleton animated={false} width="60%" />
      </SettingsScaffold>
    );
  }

  const data = profile.data;

  const requestExport = (): void => {
    setError(null);
    void requester
      .request()
      .then((output) => {
        setExportId(output.exportId);
        setToast(t.exportQueued);
      })
      .catch((cause: unknown) => {
        setError(messageFor(cause));
      });
  };

  const download = (): void => {
    const url = exported.data?.downloadUrl;
    if (url === undefined) return;
    void openExternal(url).catch((cause: unknown) => {
      setError(messageFor(cause));
    });
  };

  const schedule = (): void => {
    setError(null);
    void deletion
      .schedule()
      .then((state) => {
        setToast(t.deleteScheduled(formatUserDate(state.scheduledFor, data.me)));
        setConfirmation('');
      })
      .catch((cause: unknown) => {
        setError(messageFor(cause));
      });
  };

  const cancel = (): void => {
    setError(null);
    void deletion
      .cancel()
      .then(() => {
        setToast(fr.mobile.profile.deletionCancelled);
      })
      .catch((cause: unknown) => {
        setError(messageFor(cause));
      });
  };

  const scheduled = data.deletionScheduledFor;

  return (
    <SettingsScaffold
      title={t.title}
      testID="privacy-screen"
      onBack={close}
      subtitle={t.description}
    >
      <SettingsSection title={t.exportTitle} hint={t.exportBody} testID="privacy-export">
        <Text variant="rowSubtitle" tone="secondary" testID="privacy-export-state">
          {status === null
            ? t.exportNone
            : status === 'queued'
              ? t.exportQueued
              : status === 'running'
                ? t.exportRunning
                : status === 'done'
                  ? t.exportReady
                  : t.exportFailed}
        </Text>
        {exported.data?.sizeBytes == null ? null : (
          <Text variant="caption" tone="muted" testID="privacy-export-size">
            {t.size(sizeLabel(exported.data.sizeBytes))}
          </Text>
        )}
        {exported.data?.expiresAt == null ? null : (
          <Text variant="caption" tone="muted" testID="privacy-export-expires">
            {t.expires(formatUserDate(exported.data.expiresAt, data.me))}
          </Text>
        )}
        <View style={styles.actions}>
          <Button
            label={busy ? t.exportPending : t.exportRequest}
            onPress={requestExport}
            loading={requester.pending}
            disabled={busy || !online}
            testID="export-request"
          />
          {exported.data?.downloadUrl === undefined ? null : (
            <Button
              label={t.download}
              variant="outline"
              onPress={download}
              testID="export-download"
            />
          )}
        </View>
      </SettingsSection>

      <SettingsSection title={t.deleteTitle} hint={t.deleteBody} testID="privacy-deletion">
        {scheduled == null ? (
          <>
            <TextField
              label={t.deleteConfirmLabel}
              value={confirmation}
              onChangeText={setConfirmation}
              placeholder={t.deletePlaceholder}
              testID="deletion-confirm"
            />
            <Button
              label={deletion.pending ? t.deletePending : t.deleteTrigger}
              onPress={schedule}
              loading={deletion.pending}
              disabled={confirmation.trim() !== t.deleteWord || !online}
              testID="deletion-submit"
            />
          </>
        ) : (
          <>
            <Text variant="rowSubtitle" tone="danger" testID="privacy-deletion-state">
              {t.deleteScheduled(formatUserDate(scheduled, data.me))}
            </Text>
            <Button
              label={fr.mobile.profile.deletionCancel}
              variant="outline"
              onPress={cancel}
              loading={deletion.pending}
              disabled={!online}
              testID="deletion-cancel"
            />
          </>
        )}
      </SettingsSection>

      {error === null ? null : (
        <Text variant="caption" tone="danger" testID="privacy-error-message">
          {error}
        </Text>
      )}
    </SettingsScaffold>
  );
}

const styles = StyleSheet.create({
  actions: { gap: theme.spacing.sm, paddingTop: theme.spacing.xs },
});
