import { vapidPublicKeyFromEnv } from '@learny/config/derived-secrets';

import { SettingsView } from '../../../components/settings/settings-view';
import { AppShell } from '../../../components/shell/app-shell';
import { loadAiModelsPage } from '../../../lib/ai-models-page';
import { loadNotificationSettingsPage } from '../../../lib/notification-settings-page';
import { loadSettingsPage } from '../../../lib/settings-page';
import { loadShellPage } from '../../../lib/sidebar-page';

export const dynamic = 'force-dynamic';

interface ParametresPageProps {
  searchParams: Promise<{ retour?: string | string[] }>;
}

/** SCR-15 — settings of the connected learner (SPEC-707, SPEC-708, SPEC-709). */
export default async function ParametresPage({ searchParams }: ParametresPageProps) {
  const [shell, settings, notifications, aiModels, search] = await Promise.all([
    loadShellPage(),
    loadSettingsPage(),
    loadNotificationSettingsPage(),
    loadAiModelsPage(),
    searchParams,
  ]);
  // SPEC-4002 EF-3 — « Ajouter ma clé » ramène au dépôt : seul un chemin interne est accepté.
  const raw = Array.isArray(search.retour) ? search.retour[0] : search.retour;
  const retour = typeof raw === 'string' && /^\/(?![/\\])/u.test(raw) ? raw : undefined;
  return (
    <AppShell
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
    >
      <SettingsView
        initialState={settings.ok ? settings.data : null}
        initialError={!settings.ok}
        initialNotifications={notifications.ok ? notifications.data : null}
        notificationError={!notifications.ok}
        initialAiModels={aiModels.ok ? aiModels.data : null}
        aiModelsError={!aiModels.ok}
        // ADR-4007: the VAPID key pair is derived from APP_ENCRYPTION_KEY on the server.
        pushPublicKey={vapidPublicKeyFromEnv(process.env)}
        {...(settings.ok || settings.requestId === undefined
          ? {}
          : { requestId: settings.requestId })}
        retour={retour}
      />
    </AppShell>
  );
}
