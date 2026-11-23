// Écran Identité (SPEC-3401 EF-3, EF-4, CL-1 ; BR-ACC-05, BR-ACC-12, BR-SET-02).
//
// First name, last name, read-only e-mail, course language, tutor tone and the zone of the learner.
// « Enregistrer » stays inactive until something changed (EF-3) and sends the version the screen
// read: a stale version answers 409 and the screen reloads the server values (CL-1). The e-mail is
// never editable (BR-ACC-12) and the zone is edited on the web (ADR-3024): the application shows it.
//
// The draft is derived: as soon as the server version changes (save, conflict, pull-to-refresh) the
// local edition is dropped and the server values are shown, which is exactly what CL-1 asks for. No
// state is written in an effect.
import { useRouter } from 'expo-router';
import { useState } from 'react';

import type { ProfilePatch } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { messageFor } from '../../api/errors';
import { useProfile, useSaveProfile } from '../../data/profile';
import { formatUserDate } from '../../lib/dates';
import { useOnlineStatus } from '../../offline/network';
import { ErrorState } from '../../ui/ErrorState';
import { Segmented } from '../../ui/Segmented';
import { Skeleton } from '../../ui/Skeleton';
import { Text } from '../../ui/Text';
import { Toast } from '../../ui/Toast';
import { TextField } from '../auth/TextField';

import { SaveFooter, SettingsScaffold, SettingsSection, useUnsavedGuard } from './SettingsScaffold';

const t = fr.mobile.profile;
const st = fr.settings;

interface Draft {
  readonly firstName: string;
  readonly lastName: string;
  readonly tutorTone: string;
  readonly courseLanguage: string;
}

/** Route body of `/profil/identite`. */
export function IdentityScreen() {
  const router = useRouter();
  const online = useOnlineStatus();
  const profile = useProfile();
  const saver = useSaveProfile();
  const data = profile.data;

  const [edited, setEdited] = useState<{ version: string; value: Draft } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base: Draft =
    data === null
      ? { firstName: '', lastName: '', tutorTone: 'vous', courseLanguage: 'fr' }
      : {
          firstName: data.me.firstName ?? '',
          lastName: data.me.lastName ?? '',
          tutorTone: data.me.tutorTone,
          courseLanguage: data.me.courseLanguage,
        };
  const draft =
    edited !== null && data !== null && edited.version === data.updatedAt ? edited.value : base;

  const update = (value: Draft): void => {
    if (data === null) return;
    setEdited({ version: data.updatedAt, value });
  };

  const dirty =
    edited !== null &&
    (draft.firstName !== base.firstName ||
      draft.lastName !== base.lastName ||
      draft.tutorTone !== base.tutorTone ||
      draft.courseLanguage !== base.courseLanguage);

  const leave = useUnsavedGuard(dirty, () => {
    router.back();
  });

  const save = (): void => {
    if (data === null) return;
    setError(null);
    const patch: ProfilePatch = {
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      tutorTone: draft.tutorTone as ProfilePatch['tutorTone'],
      courseLanguage: draft.courseLanguage as ProfilePatch['courseLanguage'],
      expectedUpdatedAt: data.updatedAt,
    };
    void saver.save(patch).then((outcome) => {
      if (outcome.ok) {
        setEdited(null);
        setToast(st.saved);
        return;
      }
      setError(outcome.conflict ? t.conflict : messageFor(outcome.error));
    });
  };

  if (profile.status === 'error') {
    return (
      <SettingsScaffold title={t.identity.title} testID="identity-screen" onBack={leave}>
        <ErrorState title={t.errorTitle} onRetry={profile.refetch} testID="identity-error" />
      </SettingsScaffold>
    );
  }

  if (data === null) {
    return (
      <SettingsScaffold title={t.identity.title} testID="identity-screen" onBack={leave}>
        <Skeleton animated={false} />
        <Skeleton animated={false} width="60%" />
      </SettingsScaffold>
    );
  }

  return (
    <SettingsScaffold
      title={t.identity.title}
      testID="identity-screen"
      onBack={leave}
      subtitle={t.identity.created(formatUserDate(data.createdAt, data.me))}
      footer={
        <SaveFooter
          label={t.save}
          onPress={save}
          dirty={dirty}
          pending={saver.pending}
          disabled={!online}
        />
      }
    >
      <SettingsSection title={st.identity.title} testID="identity-fields">
        <TextField
          label={st.identity.firstName}
          value={draft.firstName}
          onChangeText={(value) => {
            update({ ...draft, firstName: value });
          }}
          testID="identity-first-name"
        />
        <TextField
          label={st.identity.lastName}
          value={draft.lastName}
          onChangeText={(value) => {
            update({ ...draft, lastName: value });
          }}
          testID="identity-last-name"
        />
        <TextField
          label={st.identity.email}
          value={data.me.email}
          onChangeText={() => undefined}
          editable={false}
          testID="identity-email"
        />
        <Text variant="caption" tone="muted">
          {st.identity.emailHint}
        </Text>
      </SettingsSection>

      <SettingsSection title={st.identity.language} testID="identity-language">
        <Segmented
          label={st.identity.language}
          value={draft.courseLanguage}
          onChange={(value) => {
            update({ ...draft, courseLanguage: value });
          }}
          options={[
            { value: 'fr', label: t.identity.languages.fr },
            { value: 'en', label: t.identity.languages.en },
          ]}
          testID="identity-language-control"
        />
      </SettingsSection>

      <SettingsSection title={st.identity.toneLabel} testID="identity-tone">
        <Segmented
          label={st.identity.toneLabel}
          value={draft.tutorTone}
          onChange={(value) => {
            update({ ...draft, tutorTone: value });
          }}
          options={[
            { value: 'vous', label: t.identity.toneVous },
            { value: 'tu', label: t.identity.toneTu },
          ]}
          testID="identity-tone-control"
        />
      </SettingsSection>

      <SettingsSection title={t.identity.timezone} testID="identity-timezone">
        <Text variant="title" testID="identity-timezone-value">
          {data.me.timezone}
        </Text>
        <Text variant="caption" tone="muted">
          {t.identity.timezoneHint}
        </Text>
      </SettingsSection>

      {draft.firstName.trim() === '' ? (
        <Text variant="caption" tone="danger" testID="identity-first-name-error">
          {t.identity.firstNameRequired}
        </Text>
      ) : null}

      {error === null ? null : (
        <Text variant="caption" tone="danger" testID="identity-error-message">
          {error}
        </Text>
      )}

      <Toast
        testID="identity-toast"
        visible={toast !== null}
        message={toast ?? ''}
        onHide={() => {
          setToast(null);
        }}
      />
    </SettingsScaffold>
  );
}
