// Premiers pas natifs (zone B, maquette PremiersPas.dc.html).
//
// Assistant de configuration en cinq étapes, identiques à celles du web : profil, rythme, IA,
// rappels, départ. L'étape 2 (« Votre rythme ») est celle de la maquette : temps par semaine,
// jours d'étude et moment préféré. Les écritures sont celles du web (`PATCH /me`,
// `PATCH /me/preferences`, `PATCH /me/onboarding`) ; le registre est le vouvoiement de
// `fr.onboarding`, réutilisé tel quel.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  OnboardingState,
  ProfileUpdateBody,
  ReminderChoices,
  StudyPreferencesDto,
} from '@learny/contracts';
import { fr } from '@learny/i18n';

import { Pop } from '../motion';
import { theme } from '../../../theme';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Chip } from '../../../ui/Chip';
import { ErrorState } from '../../../ui/ErrorState';
import { Skeleton } from '../../../ui/Skeleton';
import { Switch } from '../../../ui/Switch';
import { Text } from '../../../ui/Text';

import { CreationProgress } from './CreationProgress';
import {
  DAY_LONG,
  DAY_SHORT,
  SLOT_ORDER,
  STUDY_DAYS,
  WEEK_OPTIONS,
  draftFromPreferences,
  isStep,
  preferencesFromDraft,
  previousStep,
  stepRank,
  toggleDay,
  type RhythmDraft,
  type Step,
} from './premiers-pas-view';
import {
  useOnboardingState,
  useOnboardingUpdate,
  useProfileUpdate,
  useRhythmUpdate,
} from './use-onboarding';

const t = fr.onboarding;
const c = fr.mr.creation.premiersPas;

type Tone = 'vous' | 'tu';

function titleOf(step: Step, firstName: string): string {
  switch (step) {
    case 'profil':
      return t.profil.title;
    case 'rythme':
      return t.rythme.title;
    case 'ia':
      return t.ia.title;
    case 'rappels':
      return t.rappels.title;
    case 'depart':
      return t.depart.welcome(firstName);
  }
}

function StepHeader({
  step,
  title,
  onBack,
}: Readonly<{
  step: Step;
  title: string;
  onBack: () => void;
}>) {
  return (
    <View style={styles.header}>
      <CreationProgress
        filled={stepRank(step)}
        tone="lime"
        label={c.progressLabel}
        testID="qf-premiers-pas-progress"
      />
      <View style={styles.headerRow}>
        <Text variant="eyebrow" tone="muted">
          {c.eyebrow(stepRank(step))}
        </Text>
        <Button
          label={c.back}
          variant="text"
          size="sm"
          onPress={onBack}
          testID="qf-premiers-pas-back"
        />
      </View>
      <Text variant="heroTitle">{title}</Text>
    </View>
  );
}

function ErrorLine({ message }: Readonly<{ message: string | null }>) {
  if (message === null) return null;
  return (
    <Text variant="caption" tone="danger" testID="qf-premiers-pas-error">
      {message}
    </Text>
  );
}

function StepFooter({
  onBack,
  onContinue,
  label,
  loading,
  testID,
}: Readonly<{
  onBack: () => void;
  onContinue: () => void;
  label: string;
  loading: boolean;
  testID: string;
}>) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
      <Button label={c.back} variant="outline" onPress={onBack} testID={`${testID}-footer-back`} />
      <View style={styles.grow}>
        <Button
          label={label}
          loading={loading}
          block
          onPress={onContinue}
          testID={`${testID}-continue`}
        />
      </View>
    </View>
  );
}

interface StepProps {
  readonly state: OnboardingState;
  readonly saving: boolean;
  readonly error: string | null;
  readonly onBack: () => void;
  readonly testID: string;
}

function ProfilStep({
  state,
  saving,
  error,
  onBack,
  testID,
  onSubmit,
}: StepProps &
  Readonly<{
    onSubmit: (firstName: string, tone: Tone) => void;
  }>) {
  const [firstName, setFirstName] = useState(state.profile.firstName ?? '');
  const [tone, setTone] = useState<Tone>(state.profile.tutorTone);
  const [local, setLocal] = useState<string | null>(null);
  const name = firstName.trim() === '' ? t.profil.fallbackName : firstName.trim();
  const preview = tone === 'tu' ? t.profil.previewTu(name) : t.profil.previewVous(name);

  const submit = (): void => {
    if (firstName.trim() === '') {
      setLocal(t.profil.firstNameRequired);
      return;
    }
    setLocal(null);
    onSubmit(firstName.trim(), tone);
  };

  return (
    <View style={styles.body}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="bodySmall" tone="secondary">
          {t.profil.subtitle}
        </Text>
        <Text variant="title">{t.profil.firstName}</Text>
        <TextInput
          testID="qf-premiers-pas-first-name"
          accessibilityLabel={t.profil.firstName}
          value={firstName}
          onChangeText={setFirstName}
          placeholder={t.profil.fallbackName}
          placeholderTextColor={theme.colors.inkMuted}
          maxLength={60}
          style={styles.input}
        />
        <Text variant="title">{t.profil.toneLabel}</Text>
        <View style={styles.row}>
          <Chip
            label={t.profil.toneVous}
            tone={tone === 'vous' ? 'ink' : 'outline'}
            onPress={() => {
              setTone('vous');
            }}
            testID="qf-premiers-pas-tone-vous"
          />
          <Chip
            label={t.profil.toneTu}
            tone={tone === 'tu' ? 'ink' : 'outline'}
            onPress={() => {
              setTone('tu');
            }}
            testID="qf-premiers-pas-tone-tu"
          />
        </View>
        <Card>
          <Text variant="caption" tone="muted">
            {t.profil.previewLabel}
          </Text>
          <Text variant="bodySmall">{preview}</Text>
        </Card>
        <ErrorLine message={local ?? error} />
      </ScrollView>
      <StepFooter
        onBack={onBack}
        onContinue={submit}
        label={c.continue}
        loading={saving}
        testID={testID}
      />
    </View>
  );
}

function RhythmStep({
  state,
  saving,
  error,
  onBack,
  testID,
  onSubmit,
}: StepProps &
  Readonly<{
    onSubmit: (rhythm: StudyPreferencesDto) => void;
  }>) {
  const initial = draftFromPreferences(state.preferences);
  const [draft, setDraft] = useState<RhythmDraft>(initial);
  const [local, setLocal] = useState<string | null>(null);

  const apply = (next: RhythmDraft): void => {
    setLocal(next.studyDays.length === 0 ? c.invalidRhythm : null);
    setDraft(next);
  };

  const submit = (): void => {
    onSubmit(preferencesFromDraft(draft));
  };

  return (
    <View style={styles.body}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="bodySmall" tone="secondary">
          {t.rythme.subtitle}
        </Text>
        <Text variant="title">{c.weekHoursLabel}</Text>
        <View style={styles.row}>
          {WEEK_OPTIONS.map((hours) => (
            <Chip
              key={hours}
              label={c.weekHours(hours)}
              tone={draft.weeklyHours === hours ? 'ink' : 'outline'}
              onPress={() => {
                apply({ ...draft, weeklyHours: hours });
              }}
              testID={`qf-premiers-pas-week-${String(hours)}`}
            />
          ))}
        </View>
        <Text variant="title">{c.daysLabel}</Text>
        <View style={styles.days}>
          {STUDY_DAYS.map((day, dayIndex) => {
            const selected = draft.studyDays.includes(day);
            return (
              <Pop key={day} delay={dayIndex * 50}>
                <Pressable
                  testID={`qf-premiers-pas-day-${String(day)}`}
                  accessibilityRole="button"
                  accessibilityLabel={DAY_LONG[day] ?? String(day)}
                  accessibilityState={{ selected }}
                  hitSlop={theme.spacing.xs}
                  onPress={() => {
                    apply({ ...draft, studyDays: toggleDay(draft.studyDays, day) });
                  }}
                  style={[styles.day, selected ? styles.daySelected : null]}
                >
                  <Text variant="chip" tone={selected ? 'limeInk' : 'muted'}>
                    {DAY_SHORT[day] ?? String(day)}
                  </Text>
                </Pressable>
              </Pop>
            );
          })}
        </View>
        <Text variant="title">{c.momentLabel}</Text>
        <Card padded={false}>
          {SLOT_ORDER.map((slot, index) => {
            const selected = draft.slot === slot;
            return (
              <Pressable
                key={slot}
                testID={`qf-premiers-pas-slot-${slot}`}
                accessibilityRole="radio"
                accessibilityLabel={t.rythme.slots[slot]}
                accessibilityState={{ checked: selected }}
                onPress={() => {
                  apply({ ...draft, slot });
                }}
                style={[styles.slotRow, index > 0 ? styles.slotBorder : null]}
              >
                <View style={[styles.radio, selected ? styles.radioSelected : null]}>
                  {selected ? <View style={styles.radioDot} /> : null}
                </View>
                <Text variant="bodySmall">{t.rythme.slots[slot]}</Text>
              </Pressable>
            );
          })}
        </Card>
        <Text variant="bodySmall" testID="qf-premiers-pas-summary">
          {c.summary(draft.weeklyHours, draft.studyDays.length)}
        </Text>
        <Text variant="caption" tone="muted">
          {c.weekHoursHint}
        </Text>
        <ErrorLine message={local ?? error} />
      </ScrollView>
      <StepFooter
        onBack={onBack}
        onContinue={submit}
        label={c.continue}
        loading={saving}
        testID={testID}
      />
    </View>
  );
}

function AiStep({
  saving,
  error,
  onBack,
  testID,
  onConfigure,
  onSkip,
}: Readonly<{
  saving: boolean;
  error: string | null;
  onBack: () => void;
  testID: string;
  onConfigure: () => void;
  onSkip: () => void;
}>) {
  return (
    <View style={styles.body}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="bodySmall" tone="secondary">
          {t.ia.subtitle}
        </Text>
        <Card>
          <Text variant="bodySmall">{t.ia.intro}</Text>
        </Card>
        <Button
          label={c.configure}
          variant="ink"
          onPress={onConfigure}
          testID="qf-premiers-pas-ai-configure"
        />
        <Text variant="caption" tone="muted">
          {t.ia.skipNote}
        </Text>
        <ErrorLine message={error} />
      </ScrollView>
      <StepFooter
        onBack={onBack}
        onContinue={onSkip}
        label={t.ia.skip}
        loading={saving}
        testID={testID}
      />
    </View>
  );
}

function RemindersStep({
  state,
  saving,
  error,
  onBack,
  testID,
  onSubmit,
}: StepProps &
  Readonly<{
    onSubmit: (reminders: ReminderChoices) => void;
  }>) {
  const [reminders, setReminders] = useState<ReminderChoices>(state.reminders);

  return (
    <View style={styles.body}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="bodySmall" tone="secondary">
          {t.rappels.subtitle}
        </Text>
        <Card>
          <Switch
            label={t.rappels.push}
            description={t.rappels.pushDescription}
            value={reminders.push}
            onValueChange={(value) => {
              setReminders({ ...reminders, push: value });
            }}
            testID="qf-premiers-pas-push"
          />
          <Switch
            label={t.rappels.email}
            description={t.rappels.emailDescription}
            value={reminders.email}
            onValueChange={(value) => {
              setReminders({ ...reminders, email: value });
            }}
            testID="qf-premiers-pas-email"
          />
          <Switch
            label={t.rappels.automations}
            description={t.rappels.automationsDescription}
            value={reminders.automations}
            onValueChange={(value) => {
              setReminders({ ...reminders, automations: value });
            }}
            testID="qf-premiers-pas-automations"
          />
        </Card>
        <Text variant="caption" tone="muted">
          {t.rappels.note}
        </Text>
        <ErrorLine message={error} />
      </ScrollView>
      <StepFooter
        onBack={onBack}
        onContinue={() => {
          onSubmit(reminders);
        }}
        label={c.continue}
        loading={saving}
        testID={testID}
      />
    </View>
  );
}

function DepartStep({
  state,
  saving,
  error,
  onBack,
  testID,
  onStart,
  onHome,
}: Readonly<{
  state: OnboardingState;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  testID: string;
  onStart: () => void;
  onHome: () => void;
}>) {
  const firstName = state.profile.firstName ?? t.profil.fallbackName;
  const subtitle = state.profile.tutorTone === 'tu' ? t.depart.subtitleTu : t.depart.subtitleVous;
  return (
    <View style={styles.body}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="bodySmall" tone="secondary">
          {subtitle}
        </Text>
        <Card>
          <Text variant="sectionTitle">{t.depart.createTitle}</Text>
          <Text variant="bodySmall" tone="secondary">
            {t.depart.createDescription}
          </Text>
        </Card>
        <Button
          label={saving ? c.continue : c.start}
          loading={saving}
          onPress={onStart}
          testID={`${testID}-start`}
        />
        <Button label={c.home} variant="text" onPress={onHome} testID={`${testID}-home`} />
        <Text variant="caption" tone="muted">
          {t.depart.welcome(firstName)}
        </Text>
        <ErrorLine message={error} />
      </ScrollView>
      <View style={styles.footer}>
        <Button
          label={c.back}
          variant="outline"
          onPress={onBack}
          testID={`${testID}-footer-back`}
        />
      </View>
    </View>
  );
}

/** Écran des premiers pas natifs, une étape par valeur de route. */
export function PremiersPasScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ step?: string }>();
  const onboarding = useOnboardingState();
  const onboardingUpdate = useOnboardingUpdate();
  const profileUpdate = useProfileUpdate();
  const rhythmUpdate = useRhythmUpdate();
  const [error, setError] = useState<string | null>(null);

  const state = onboarding.state;
  const stored = state?.profile.onboardingStep ?? null;
  const routeStep = typeof params.step === 'string' && isStep(params.step) ? params.step : null;
  const step: Step = routeStep ?? (stored !== null && isStep(stored) ? stored : 'profil');
  const saving = onboardingUpdate.pending || profileUpdate.pending || rhythmUpdate.pending;

  const go = (next: Step): void => {
    router.replace(`/premiers-pas/${next}`);
  };
  const back = (): void => {
    const previous = previousStep(step);
    if (previous !== null) go(previous);
    else if (router.canGoBack()) router.back();
    else router.replace('/aujourdhui');
  };
  const fail = (code: string | null): void => {
    setError(code === 'ONBOARDING_AI_REQUIRED' ? t.ia.continueError : c.saveError);
  };

  const saveProfil = async (firstName: string, tone: Tone): Promise<void> => {
    setError(null);
    const body: ProfileUpdateBody = { firstName, tutorTone: tone };
    const saved = await profileUpdate.update(body);
    if (!saved.ok) {
      fail(saved.code);
      return;
    }
    const advanced = await onboardingUpdate.advance({ step: 'rythme' });
    if (!advanced.ok) {
      fail(advanced.code);
      return;
    }
    go('rythme');
  };

  const saveRythme = async (rhythm: StudyPreferencesDto): Promise<void> => {
    setError(null);
    const saved = await rhythmUpdate.save(rhythm);
    if (!saved.ok) {
      fail(saved.code);
      return;
    }
    const advanced = await onboardingUpdate.advance({ step: 'ia' });
    if (!advanced.ok) {
      fail(advanced.code);
      return;
    }
    go('ia');
  };

  const skipIa = async (): Promise<void> => {
    setError(null);
    const advanced = await onboardingUpdate.advance({ step: 'rappels' });
    if (!advanced.ok) {
      fail(advanced.code);
      return;
    }
    go('rappels');
  };

  const saveRappels = async (reminders: ReminderChoices): Promise<void> => {
    setError(null);
    const advanced = await onboardingUpdate.advance({ step: 'depart', reminders });
    if (!advanced.ok) {
      fail(advanced.code);
      return;
    }
    go('depart');
  };

  const finish = async (target: '/programme/cadrage' | '/aujourdhui'): Promise<void> => {
    setError(null);
    const advanced = await onboardingUpdate.advance({ step: 'done' });
    if (!advanced.ok) {
      fail(advanced.code);
      return;
    }
    router.replace(target);
  };

  if (onboarding.status === 'error') {
    return (
      <View
        testID="qf-premiers-pas"
        style={[styles.screen, { paddingTop: insets.top + theme.spacing.sm }]}
      >
        <View style={styles.state}>
          <ErrorState
            title={c.saveError}
            onRetry={onboarding.retry}
            testID="qf-premiers-pas-load-error"
          />
        </View>
      </View>
    );
  }

  if (state === null) {
    return (
      <View
        testID="qf-premiers-pas"
        style={[styles.screen, { paddingTop: insets.top + theme.spacing.sm }]}
      >
        <View style={styles.state} testID="qf-premiers-pas-loading">
          <Skeleton animated={false} />
          <Skeleton animated={false} width="80%" />
          <Skeleton animated={false} width="60%" />
        </View>
      </View>
    );
  }

  const firstName = state.profile.firstName ?? t.profil.fallbackName;
  const common = { state, saving, error, onBack: back, testID: 'qf-premiers-pas' };

  return (
    <View
      testID="qf-premiers-pas"
      style={[styles.screen, { paddingTop: insets.top + theme.spacing.sm }]}
    >
      <StepHeader step={step} title={titleOf(step, firstName)} onBack={back} />
      {step === 'profil' ? (
        <ProfilStep
          {...common}
          onSubmit={(value, tone) => {
            void saveProfil(value, tone);
          }}
        />
      ) : null}
      {step === 'rythme' ? (
        <RhythmStep
          {...common}
          onSubmit={(rhythm) => {
            void saveRythme(rhythm);
          }}
        />
      ) : null}
      {step === 'ia' ? (
        <AiStep
          saving={saving}
          error={error}
          onBack={back}
          onConfigure={() => {
            router.push('/profil/modeles');
          }}
          onSkip={() => {
            void skipIa();
          }}
          testID="qf-premiers-pas"
        />
      ) : null}
      {step === 'rappels' ? (
        <RemindersStep
          {...common}
          onSubmit={(reminders) => {
            void saveRappels(reminders);
          }}
        />
      ) : null}
      {step === 'depart' ? (
        <DepartStep
          state={state}
          saving={saving}
          error={error}
          onBack={back}
          onStart={() => {
            void finish('/programme/cadrage');
          }}
          onHome={() => {
            void finish('/aujourdhui');
          }}
          testID="qf-premiers-pas"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.canvas },
  header: {
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  body: { flex: 1 },
  content: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  state: { padding: theme.spacing.xl, gap: theme.spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  days: { flexDirection: 'row', gap: theme.spacing.sm },
  day: {
    flex: 1,
    minHeight: theme.minTouchTarget.height,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.surface,
  },
  daySelected: {
    borderColor: theme.colors.lime,
    backgroundColor: theme.colors.limeSoft,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: theme.controls.row,
    paddingHorizontal: theme.spacing.lg,
  },
  slotBorder: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  radio: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  radioSelected: { borderColor: theme.colors.ink },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.ink,
  },
  input: {
    ...theme.type.bodySmall,
    minHeight: theme.minTouchTarget.height,
    paddingHorizontal: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.surface,
    color: theme.colors.ink,
  },
  footer: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    backgroundColor: theme.colors.surface,
  },
  grow: { flex: 1 },
});
