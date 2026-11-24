// Écran Rythme et rappels (SPEC-3401 EF-3, EF-5, CL-1 ; BR-ACC-08, BR-SET-02, BR-AUT-10).
//
// Hours per day (1 to 6), study days and the preferred moments, with the numeric summary of
// BR-ACC-08 (« 25 h par semaine · soir »). « Enregistrer » sends the profile patch with the version
// it read; the action « Mettre en pause » opens the pause sheet of EF-5, the way the account sheet
// does. The draft is derived from the server version, never written in an effect (CL-1).
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ProfilePatch, StudyPreferencesDto } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { messageFor } from '../../api/errors';
import { useProfile, useSaveProfile } from '../../data/profile';
import { useOnlineStatus } from '../../offline/network';
import { theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { ErrorState } from '../../ui/ErrorState';
import { Skeleton } from '../../ui/Skeleton';
import { Text } from '../../ui/Text';
import { Toast } from '../../ui/Toast';

import { PauseSheet } from './PauseSheet';
import {
  dayShort,
  isValidRhythm,
  momentLabels,
  rhythmDetail,
  rhythmSummary,
} from './rhythm-summary';
import { SaveFooter, SettingsScaffold, SettingsSection, useUnsavedGuard } from './SettingsScaffold';

const t = fr.mobile.profile;
const r = t.rhythm;
const st = fr.settings;

const HOUR_OPTIONS = [1, 2, 3, 4, 5, 6] as const;
const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const MOMENTS = ['matin', 'apres_midi', 'soir'] as const;

/** Route body of `/profil/rythme`. */
export function RhythmScreen() {
  const router = useRouter();
  const online = useOnlineStatus();
  const profile = useProfile();
  const saver = useSaveProfile();
  const data = profile.data;

  const [edited, setEdited] = useState<{ version: string; value: StudyPreferencesDto } | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pauseOpen, setPauseOpen] = useState(false);

  const base: StudyPreferencesDto | null = data === null ? null : data.rhythm;
  const draft =
    edited !== null && data !== null && edited.version === data.updatedAt ? edited.value : base;

  const update = (value: StudyPreferencesDto): void => {
    if (data === null) return;
    setEdited({ version: data.updatedAt, value });
  };

  const dirty =
    edited !== null &&
    draft !== null &&
    base !== null &&
    (draft.hoursPerDay !== base.hoursPerDay ||
      draft.studyDays.join(',') !== base.studyDays.join(',') ||
      draft.preferredSlots.join(',') !== base.preferredSlots.join(','));
  const valid = draft !== null && isValidRhythm(draft);

  const leave = useUnsavedGuard(dirty, () => {
    router.back();
  });

  const save = (): void => {
    if (draft === null || data === null) return;
    setError(null);
    const patch: ProfilePatch = { rhythm: draft, expectedUpdatedAt: data.updatedAt };
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
      <SettingsScaffold title={r.title} testID="rhythm-screen" onBack={leave}>
        <ErrorState title={t.errorTitle} onRetry={profile.refetch} testID="rhythm-error" />
      </SettingsScaffold>
    );
  }

  if (data === null || draft === null) {
    return (
      <SettingsScaffold title={r.title} testID="rhythm-screen" onBack={leave}>
        <Skeleton animated={false} />
        <Skeleton animated={false} width="60%" />
      </SettingsScaffold>
    );
  }

  const toggleDay = (day: number): void => {
    const days = draft.studyDays.includes(day)
      ? draft.studyDays.filter((value) => value !== day)
      : [...draft.studyDays, day].sort((first, second) => first - second);
    update({ ...draft, studyDays: days });
  };

  const toggleMoment = (moment: string): void => {
    const current: string[] = [...draft.preferredSlots];
    const slots = current.includes(moment)
      ? current.filter((value) => value !== moment)
      : [...current, moment];
    update({ ...draft, preferredSlots: MOMENTS.filter((value) => slots.includes(value)) });
  };

  return (
    <SettingsScaffold
      title={r.title}
      testID="rhythm-screen"
      onBack={leave}
      toast={
        <Toast
          testID="rhythm-toast"
          visible={toast !== null}
          message={toast ?? ''}
          onHide={() => {
            setToast(null);
          }}
        />
      }
      subtitle={r.subtitle}
      footer={
        <SaveFooter
          label={t.save}
          onPress={save}
          dirty={dirty && valid}
          pending={saver.pending}
          disabled={!online}
        />
      }
    >
      <SettingsSection title={r.summary} testID="rhythm-summary-section">
        <Text variant="sectionTitle" testID="rhythm-summary">
          {rhythmSummary(draft)}
        </Text>
        <Text variant="rowSubtitle" tone="muted" testID="rhythm-detail">
          {rhythmDetail(draft)}
        </Text>
      </SettingsSection>

      <SettingsSection title={r.hours} testID="rhythm-hours">
        <View style={styles.options}>
          {HOUR_OPTIONS.map((hours) => (
            <Chip
              key={hours}
              label={r.hoursOption(hours)}
              tone={draft.hoursPerDay === hours ? 'ink' : 'outline'}
              onPress={() => {
                update({ ...draft, hoursPerDay: hours });
              }}
              testID={`rhythm-hours-${String(hours)}`}
            />
          ))}
        </View>
      </SettingsSection>

      <SettingsSection title={r.daysLabel} testID="rhythm-days">
        <View style={styles.options}>
          {DAYS.map((day) => (
            <Chip
              key={day}
              label={dayShort(day)}
              tone={draft.studyDays.includes(day) ? 'lime' : 'outline'}
              onPress={() => {
                toggleDay(day);
              }}
              testID={`rhythm-day-${String(day)}`}
            />
          ))}
        </View>
        <Text variant="rowSubtitle" tone="muted" testID="rhythm-days-label">
          {draft.studyDays
            .map((day) => r.dayLong[day - 1] ?? '')
            .filter((label) => label !== '')
            .join(', ')}
        </Text>
      </SettingsSection>

      <SettingsSection title={r.momentsLabel} testID="rhythm-moments">
        <View style={styles.options}>
          {MOMENTS.map((moment) => (
            <Chip
              key={moment}
              label={r.momentsOptions[moment]}
              tone={draft.preferredSlots.includes(moment) ? 'lime' : 'outline'}
              onPress={() => {
                toggleMoment(moment);
              }}
              testID={`rhythm-moment-${moment}`}
            />
          ))}
        </View>
        <Text variant="rowSubtitle" tone="muted" testID="rhythm-moments-label">
          {momentLabels(draft).join(' · ')}
        </Text>
      </SettingsSection>

      {valid ? null : (
        <Text variant="caption" tone="danger" testID="rhythm-invalid">
          {r.invalid}
        </Text>
      )}

      <Button
        label={r.pause}
        variant="outline"
        icon="pause"
        onPress={() => {
          setPauseOpen(true);
        }}
        testID="rhythm-pause"
      />

      {error === null ? null : (
        <Text variant="caption" tone="danger" testID="rhythm-error-message">
          {error}
        </Text>
      )}

      <PauseSheet
        visible={pauseOpen}
        onClose={() => {
          setPauseOpen(false);
        }}
        onDone={(message) => {
          setToast(message);
        }}
        timeZone={data.me.timezone}
      />
    </SettingsScaffold>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
});
