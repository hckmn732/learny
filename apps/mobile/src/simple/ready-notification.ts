// Notification de fin d'analyse (SPEC-4003 EF-5).
//
// The backend of P40 does not push the end of an analysis yet: while the application polls, this
// module presents the same payload as the Web Push of SPEC-3501 (title, body, internal
// destination). Tapping it goes through `PushBridge`, so the preview opens after the auth gate and
// the foreground banner has exactly the same shape as a server notification.
import * as Notifications from 'expo-notifications';

import { fr } from '@learny/i18n';

const t = fr.mobile.simple.analysis;

/** Identifiant stable : une seule notification par formation. */
export function readyNotificationId(formationId: string): string {
  return `simple-ready-${formationId}`;
}

/** Présente « Ton programme est prêt » ; les erreurs de permission restent silencieuses. */
export async function presentReadyNotification(formationId: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: readyNotificationId(formationId),
      content: {
        title: t.notification,
        body: t.notificationBody,
        data: {
          title: t.notification,
          body: t.notificationBody,
          url: `/formations/${formationId}/apercu`,
          tag: `simple-ready-${formationId}`,
        },
      },
      trigger: null,
    });
  } catch {
    // Une notification refusée ne bloque jamais l'écran : l'aperçu reste accessible.
  }
}
