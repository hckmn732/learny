import { SettingsView } from '../../../components/settings/settings-view';
import { AppShell } from '../../../components/shell/app-shell';
import { loadAiModelsPage } from '../../../lib/ai-models-page';
import { loadNotificationSettingsPage } from '../../../lib/notification-settings-page';
import { getPublicEnv } from '../../../lib/server-env';
import { loadSettingsPage } from '../../../lib/settings-page';
import { loadShellPage } from '../../../lib/sidebar-page';

export const dynamic = 'force-dynamic';

/** SCR-15 — settings of the connected learner (SPEC-707, SPEC-708, SPEC-709). */
export default async function ParametresPage() {
  const [shell, settings, notifications, aiModels] = await Promise.all([
    loadShellPage(),
    loadSettingsPage(),
    loadNotificationSettingsPage(),
    loadAiModelsPage(),
  ]);
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
        pushPublicKey={getPublicEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY}
        {...(settings.ok || settings.requestId === undefined
          ? {}
          : { requestId: settings.requestId })}
      />
    </AppShell>
  );
}
