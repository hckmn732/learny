// Bandeau de suppression programmée sur Aujourd'hui (SPEC-3401 EF-6, BR-ACC-11).
//
// After a deletion request the banner « Suppression prévue le … » shows on the Profil tab and on
// Aujourd'hui, with the way to cancel (same behaviour as the web). The state comes from
// `/me/profile`: the schedule belongs to SPEC-211, this component only displays and cancels.
import { useState } from 'react';

import { fr } from '@learny/i18n';

import { messageFor } from '../../api/errors';
import { useDeletion, useProfile } from '../../data/profile';
import { formatUserDate } from '../../lib/dates';
import { Banner } from '../../ui/Banner';
import { Toast } from '../../ui/Toast';

const t = fr.mobile.profile;

/** Banner of a scheduled deletion, silent when nothing is scheduled. */
export function DeletionNotice() {
  const profile = useProfile();
  const deletion = useDeletion();
  const [toast, setToast] = useState<string | null>(null);

  const scheduled = profile.data?.deletionScheduledFor ?? null;
  if (scheduled === null || profile.data === null) return null;

  const cancel = (): void => {
    void deletion
      .cancel()
      .then(() => {
        setToast(t.deletionCancelled);
      })
      .catch((cause: unknown) => {
        setToast(messageFor(cause));
      });
  };

  return (
    <>
      <Banner
        testID="today-deletion-banner"
        tone="offline"
        icon="alert"
        title={t.deletionBanner(formatUserDate(scheduled, profile.data.me))}
        action={{ label: t.deletionCancel, onPress: cancel }}
      />
      <Toast
        testID="today-deletion-toast"
        visible={toast !== null}
        message={toast ?? ''}
        onHide={() => {
          setToast(null);
        }}
      />
    </>
  );
}
