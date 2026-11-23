// Écran Notifications (SPEC-3401 EF-3, CL-1 ; BR-SET-03).
//
// The application channel is locked (the contract only accepts `true`), the e-mail channel and the
// six types are configurable, the counter « N sur 6 activés » follows the server (BR-SET-03), and
// the quiet hours, the daily programme and the weekend rule are edited here. The browser channel is
// not displayed before SPEC-3501 (BR-SET-03). A save carries the version it read (CL-1); the draft is
// derived from that version, never written in an effect.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { NotificationSettingsDto, NotificationSettingsPatch } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { messageFor } from '../../api/errors';
import {
  useNotificationSettings,
  useSaveNotificationSettings,
} from '../../data/notification-settings';
import { useOnlineStatus } from '../../offline/network';
import { theme } from '../../theme';
import { Chip } from '../../ui/Chip';
import { ErrorState } from '../../ui/ErrorState';
import { Skeleton } from '../../ui/Skeleton';
import { Switch } from '../../ui/Switch';
import { Text } from '../../ui/Text';
import { Toast } from '../../ui/Toast';

import { SaveFooter, SettingsScaffold, SettingsSection, useUnsavedGuard } from './SettingsScaffold';

const p = fr.mobile.profile;
const t = fr.mobile.profile.notifications;
const st = fr.settings.notificationsTab;
const shared = fr.settings;

const DIGEST_TIMES = ['07:00', '08:00', '09:00'] as const;
const QUIET_STARTS = ['20:00', '21:00', '22:00', '23:00'] as const;
const QUIET_ENDS = ['06:00', '07:00', '08:00'] as const;
const TYPE_IDS = ['revision', 'validation', 'course', 'gap', 'planning', 'relaunch'] as const;

interface Draft {
  readonly email: boolean;
  readonly types: Record<string, boolean>;
  readonly digestTime: string;
  readonly quietStart: string;
  readonly quietEnd: string;
  readonly weekendQuiet: boolean;
}

function draftOf(settings: NotificationSettingsDto): Draft {
  return {
    email: settings.channels.email,
    types: { ...settings.types },
    digestTime: settings.digestTime,
    quietStart: settings.quiet.start,
    quietEnd: settings.quiet.end,
    weekendQuiet: settings.weekendQuiet,
  };
}

/** Number of active type switches, as the counter of BR-SET-03 shows it. */
function activeTypes(types: Record<string, boolean>): number {
  return TYPE_IDS.filter((id) => types[id] === true).length;
}

/** Route body of `/profil/notifications`. */
export function NotificationsScreen() {
  const router = useRouter();
  const online = useOnlineStatus();
  const settings = useNotificationSettings();
  const saver = useSaveNotificationSettings();
  const data = settings.data;

  const [edited, setEdited] = useState<{ version: string; value: Draft } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base: Draft | null = data === null ? null : draftOf(data);
  const draft =
    edited !== null && data !== null && edited.version === data.updatedAt ? edited.value : base;

  const update = (value: Draft): void => {
    if (data === null) return;
    setEdited({ version: data.updatedAt, value });
  };

  const dirty =
    edited !== null &&
    base !== null &&
    draft !== null &&
    (draft.email !== base.email ||
      draft.digestTime !== base.digestTime ||
      draft.quietStart !== base.quietStart ||
      draft.quietEnd !== base.quietEnd ||
      draft.weekendQuiet !== base.weekendQuiet ||
      TYPE_IDS.some((id) => draft.types[id] !== base.types[id]));

  const leave = useUnsavedGuard(dirty, () => {
    router.back();
  });

  const save = (): void => {
    if (draft === null || data === null) return;
    setError(null);
    const patch: NotificationSettingsPatch = {
      channels: { email: draft.email },
      types: {
        revision: draft.types.revision === true,
        validation: draft.types.validation === true,
        course: draft.types.course === true,
        gap: draft.types.gap === true,
        planning: draft.types.planning === true,
        relaunch: draft.types.relaunch === true,
      },
      digestTime: draft.digestTime,
      quietStart: draft.quietStart,
      quietEnd: draft.quietEnd,
      weekendQuiet: draft.weekendQuiet,
      expectedUpdatedAt: data.updatedAt,
    };
    void saver.save(patch).then((outcome) => {
      if (outcome.ok) {
        setEdited(null);
        setToast(shared.saved);
        return;
      }
      setError(outcome.conflict ? p.conflict : messageFor(outcome.error));
    });
  };

  if (settings.status === 'error') {
    return (
      <SettingsScaffold title={t.title} testID="notifications-screen" onBack={leave}>
        <ErrorState title={t.errorTitle} onRetry={settings.refetch} testID="notifications-error" />
      </SettingsScaffold>
    );
  }

  if (data === null || draft === null) {
    return (
      <SettingsScaffold title={t.title} testID="notifications-screen" onBack={leave}>
        <Skeleton animated={false} />
        <Skeleton animated={false} width="60%" />
      </SettingsScaffold>
    );
  }

  return (
    <SettingsScaffold
      title={t.title}
      testID="notifications-screen"
      onBack={leave}
      subtitle={t.channelsHint}
      footer={
        <SaveFooter
          label={shared.save}
          onPress={save}
          dirty={dirty}
          pending={saver.pending}
          disabled={!online}
        />
      }
    >
      <SettingsSection title={t.channels} testID="notifications-channels">
        <Switch
          label={t.app}
          description={t.appHint}
          value
          disabled
          onValueChange={() => undefined}
          testID="notifications-channel-app"
        />
        <Switch
          label={st.channels.email.label}
          value={draft.email}
          onValueChange={(value) => {
            update({ ...draft, email: value });
          }}
          testID="notifications-channel-email"
        />
      </SettingsSection>

      <SettingsSection title={t.typesTitle} hint={st.typesDescription} testID="notifications-types">
        <Text variant="rowSubtitle" tone="secondary" testID="notifications-type-count">
          {st.typeCount(activeTypes(draft.types))}
        </Text>
        {TYPE_IDS.map((id) => (
          <Switch
            key={id}
            label={st.types[id].label}
            description={st.types[id].description}
            value={draft.types[id] === true}
            onValueChange={(value) => {
              update({ ...draft, types: { ...draft.types, [id]: value } });
            }}
            testID={`notifications-type-${id}`}
          />
        ))}
      </SettingsSection>

      <SettingsSection title={t.when} hint={st.whenDescription} testID="notifications-when">
        <Text variant="label" tone="muted">
          {t.digest}
        </Text>
        <View style={styles.options}>
          {DIGEST_TIMES.map((time) => (
            <Chip
              key={time}
              label={time}
              tone={draft.digestTime === time ? 'ink' : 'outline'}
              onPress={() => {
                update({ ...draft, digestTime: time });
              }}
              testID={`notifications-digest-${time}`}
            />
          ))}
        </View>

        <Text variant="label" tone="muted">
          {t.quietStart}
        </Text>
        <View style={styles.options}>
          {QUIET_STARTS.map((time) => (
            <Chip
              key={time}
              label={time}
              tone={draft.quietStart === time ? 'ink' : 'outline'}
              onPress={() => {
                update({ ...draft, quietStart: time });
              }}
              testID={`notifications-quiet-start-${time}`}
            />
          ))}
        </View>
        <Text variant="label" tone="muted">
          {t.quietEnd}
        </Text>
        <View style={styles.options}>
          {QUIET_ENDS.map((time) => (
            <Chip
              key={time}
              label={time}
              tone={draft.quietEnd === time ? 'ink' : 'outline'}
              onPress={() => {
                update({ ...draft, quietEnd: time });
              }}
              testID={`notifications-quiet-end-${time}`}
            />
          ))}
        </View>
        <Text variant="rowSubtitle" tone="muted" testID="notifications-quiet-range">
          {draft.quietStart === draft.quietEnd
            ? t.quietEmpty
            : t.quietEffective(draft.quietStart, draft.quietEnd, draft.quietStart > draft.quietEnd)}
        </Text>

        <Switch
          label={t.weekend}
          value={draft.weekendQuiet}
          onValueChange={(value) => {
            update({ ...draft, weekendQuiet: value });
          }}
          testID="notifications-weekend"
        />
      </SettingsSection>

      {error === null ? null : (
        <Text variant="caption" tone="danger" testID="notifications-error-message">
          {error}
        </Text>
      )}

      <Toast
        testID="notifications-toast"
        visible={toast !== null}
        message={toast ?? ''}
        onHide={() => {
          setToast(null);
        }}
      />
    </SettingsScaffold>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
});
