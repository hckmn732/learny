'use client';

import { AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  SETTINGS_DEFAULT_TAB,
  SETTINGS_TAB_IDS,
  settingsTabFromHash,
  type CourseLanguage,
  type SettingsState,
  type SettingsTab,
  type StudyRhythm,
  type TutorTone,
} from '@learny/contracts';
import { clock, formatUserDate } from '@learny/core';
import {
  AlertDialog,
  Avatar,
  Button,
  Card,
  ErrorState,
  FormError,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextField,
} from '@learny/ui';
import { cn } from '@learny/ui';

import { ApiError, api } from '../../lib/api-client';
import { fr } from '../../messages/fr';
import { detectedTimeZone } from '../onboarding/ProfileStep';
import { rhythmSummary, togglePreferredSlot, toggleStudyDay } from '../onboarding/RhythmSummary';

const t = fr.settings;
const onboardingT = fr.onboarding;

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const SLOTS = ['matin', 'apres_midi', 'soir'] as const;
const HOURS = [1, 2, 3, 4, 5, 6] as const;

/** ADR-0047 — offsets are labelled at the frozen instant, like the maquette (UTC+1 for Paris). */
const LABEL_INSTANT = '2026-11-11T12:20:00Z';

/** BR-ACC-07 — « Europe/Paris (UTC+1) », computed once per zone. */
function timezoneLabel(zone: string): string {
  const offset =
    new Intl.DateTimeFormat('fr-FR', {
      timeZone: zone,
      timeZoneName: 'shortOffset',
    })
      .formatToParts(new Date(LABEL_INSTANT))
      .find((part) => part.type === 'timeZoneName')
      ?.value.replace(/^UTC/, 'UTC') ?? 'UTC';
  return `${zone} (${offset})`;
}

/** The maquette zones plus the stored and detected ones, without duplicates (BR-ACC-07). */
function timezoneOptions(current: string): { value: string; label: string }[] {
  const detected = detectedTimeZone(current);
  const zones = [current, detected, 'Europe/Paris', 'Europe/London', 'America/Montreal'];
  return [...new Set(zones)].map((zone) => ({ value: zone, label: timezoneLabel(zone) }));
}

function exportStatusLabel(status: string): string {
  if (status === 'queued') return t.privacy.exportQueued;
  if (status === 'running') return t.privacy.exportRunning;
  if (status === 'done') return t.privacy.exportReady;
  return t.privacy.exportFailed;
}

function sizeOf(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1000) return `${String(bytes)} o`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1).replace('.', ',')} Ko`;
  return `${(bytes / 1_000_000).toFixed(1).replace('.', ',')} Mo`;
}

function createdLabel(iso: string): string {
  return formatUserDate(iso, 'Europe/Paris', { day: 'numeric', month: 'long', year: 'numeric' });
}

function longDateTimeLabel(iso: string, timeZone: string): string {
  return formatUserDate(iso, timeZone, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

function dayDateLabel(iso: string, timeZone: string): string {
  return formatUserDate(iso, timeZone, { day: 'numeric', month: 'long', year: 'numeric' });
}

function chipClass(selected: boolean): string {
  return cn(
    'min-h-40 cursor-pointer rounded-12 border border-solid px-14 text-14',
    selected
      ? 'border-ink bg-ink font-700 text-white'
      : 'border-border-strong bg-surface font-500 text-ink',
  );
}

export interface SettingsViewProps {
  initialState: SettingsState | null;
  initialError: boolean;
  requestId?: string;
}

interface ProfileValues {
  firstName: string;
  lastName: string;
  tutorTone: TutorTone;
  courseLanguage: CourseLanguage;
  timezone: string;
  rhythm: StudyRhythm;
}

function valuesOf(state: SettingsState): ProfileValues {
  return {
    firstName: state.me.firstName ?? '',
    lastName: state.me.lastName ?? '',
    tutorTone: state.me.tutorTone,
    courseLanguage: state.me.courseLanguage,
    timezone: state.me.timezone,
    rhythm: {
      hoursPerDay: state.rhythm.hoursPerDay,
      studyDays: [...state.rhythm.studyDays],
      preferredSlots: [...state.rhythm.preferredSlots],
    },
  };
}

/** SCR-15 — settings screen: ARIA tabs in the URL hash, Profil tab, data and privacy (SPEC-707). */
export function SettingsView({ initialState, initialError, requestId }: SettingsViewProps) {
  const router = useRouter();
  const [state, setState] = useState<SettingsState | null>(initialState);
  const [values, setValues] = useState<ProfileValues>(
    initialState === null
      ? {
          firstName: '',
          lastName: '',
          tutorTone: 'vous',
          courseLanguage: 'fr',
          timezone: 'Europe/Paris',
          rhythm: { hoursPerDay: 2, studyDays: [1, 2, 3, 4, 5], preferredSlots: ['soir'] },
        }
      : valuesOf(initialState),
  );
  const [tab, setTab] = useState<SettingsTab>(SETTINGS_DEFAULT_TAB);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [exportState, setExportState] = useState<SettingsState['export']>(
    initialState?.export ?? null,
  );
  const [deletionScheduledFor, setDeletionScheduledFor] = useState<string | null>(
    initialState?.deletionScheduledFor ?? null,
  );
  const pollRef = useRef<number | null>(null);

  // BR-SET-01 — the active tab follows the hash; Profil is the default and an unknown hash is
  // normalised in the URL without navigation or focus loss (CL-3, ET-5).
  useEffect(() => {
    const apply = () => {
      const next = settingsTabFromHash(window.location.hash);
      setTab((previous) => (previous === next ? previous : next));
      if (window.location.hash !== `#${next}`) {
        window.history.replaceState(null, '', `#${next}`);
      }
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => {
      window.removeEventListener('hashchange', apply);
    };
  }, []);

  // Stop the export poll when the screen unmounts.
  useEffect(
    () => () => {
      if (pollRef.current !== null) window.clearTimeout(pollRef.current);
    },
    [],
  );

  const refetch = useCallback(async (): Promise<void> => {
    const next = await api.meProfileGet({});
    setState(next);
    setValues(valuesOf(next));
    setExportState(next.export);
    setDeletionScheduledFor(next.deletionScheduledFor);
  }, []);

  const changeTab = (value: string): void => {
    const next = (SETTINGS_TAB_IDS as readonly string[]).includes(value)
      ? (value as SettingsTab)
      : SETTINGS_DEFAULT_TAB;
    setTab(next);
    // replaceState keeps the focus on the activated tab (ET-5) and never scrolls.
    window.history.replaceState(null, '', `#${next}`);
  };

  const save = async (): Promise<void> => {
    if (saving || state === null) return;
    const clean = values.firstName.trim();
    if (clean === '') {
      setError(onboardingT.profil.firstNameRequired);
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await api.meProfileUpdate({
        body: {
          firstName: clean,
          lastName: values.lastName.trim(),
          tutorTone: values.tutorTone,
          courseLanguage: values.courseLanguage,
          timezone: values.timezone,
          rhythm: values.rhythm,
          expectedUpdatedAt: state.updatedAt,
        },
      });
      setState(next);
      setValues(valuesOf(next));
      setExportState(next.export);
      setDeletionScheduledFor(next.deletionScheduledFor);
      setSaved(true);
      // ET-3 — the views that depend on the zone or the rhythm are re-rendered with the new values.
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'CONFLICT') {
        // CL-2 — restore the current state before asking for a new attempt.
        try {
          await refetch();
        } catch {
          // The refetch failure keeps the current screen; the conflict message stays shown.
        }
        setError(t.conflict);
      } else if (cause instanceof ApiError && cause.code === 'VALIDATION_FAILED') {
        setError(cause.errors?.[0]?.message ?? t.saveError);
      } else {
        setError(t.saveError);
      }
    } finally {
      setSaving(false);
    }
  };

  const requestExport = async (): Promise<void> => {
    setPrivacyBusy(true);
    try {
      const created = await api.meExportRequest({});
      const read = async (): Promise<void> => {
        const found = await api.meExportRead({ params: { id: created.exportId } });
        setExportState({
          id: found.id,
          status: found.status,
          sizeBytes: found.sizeBytes,
          createdAt: found.createdAt,
          expiresAt: found.expiresAt ?? null,
        });
        if (found.status === 'queued' || found.status === 'running') {
          pollRef.current = window.setTimeout(() => {
            void read();
          }, 2000);
        }
      };
      await read();
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause.detail);
      else setError(t.saveError);
    } finally {
      setPrivacyBusy(false);
    }
  };

  const scheduleDeletion = async (): Promise<void> => {
    setPrivacyBusy(true);
    try {
      const result = await api.meDeletionSchedule({});
      setDeletionScheduledFor(result.scheduledFor);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.detail : t.saveError);
    } finally {
      setPrivacyBusy(false);
    }
  };

  const cancelDeletion = async (): Promise<void> => {
    setPrivacyBusy(true);
    try {
      await api.meDeletionCancel({});
      setDeletionScheduledFor(null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.detail : t.saveError);
    } finally {
      setPrivacyBusy(false);
    }
  };

  if (state === null) {
    return (
      <main className="mx-auto flex w-full max-w-content flex-col gap-24 px-16 pb-56 pt-24 shell:px-0">
        {initialError ? (
          <ErrorState
            className="rounded-24 border border-solid border-border bg-surface"
            title={t.errorTitle}
            {...(requestId === undefined ? {} : { requestId })}
            onRetry={() => {
              void refetch();
            }}
          />
        ) : (
          <p className="m-0 text-14 text-ink-muted">{t.loading}</p>
        )}
      </main>
    );
  }

  const me = state.me;
  const rhythm = values.rhythm;

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-24 px-16 pb-56 pt-24 shell:px-0">
      <Tabs data-testid="settings-tabs-root" value={tab} onValueChange={changeTab}>
        <header className="flex flex-wrap items-end justify-between gap-16">
          <div className="flex min-w-0 flex-col gap-4">
            <p className="m-0 text-14 text-ink-muted">{t.eyebrow}</p>
            <h1
              className="m-0 font-display text-34 font-600 tracking-title"
              data-testid="settings-title"
            >
              {t.tabs[tab]}
            </h1>
          </div>
          <TabsList aria-label={t.tabsLabel} data-testid="settings-tabs" variant="solid">
            {SETTINGS_TAB_IDS.map((id) => (
              <TabsTrigger data-testid={`settings-tab-${id}`} key={id} value={id}>
                {t.tabs[id]}
              </TabsTrigger>
            ))}
          </TabsList>
        </header>

        <TabsContent className="mt-24" value="profil">
          <div className="flex flex-col gap-24">
            <div className="flex flex-wrap items-start gap-20">
              <Card
                className="flex min-w-0 flex-[1_1_420px] flex-col gap-18"
                data-testid="profile-identity"
              >
                <div className="flex items-center gap-16">
                  <Avatar
                    className="size-64 font-display text-22"
                    data-testid="profile-avatar"
                    firstName={me.firstName}
                    lastName={me.lastName}
                  />
                  <div className="flex min-w-0 flex-col gap-2">
                    <h2 className="m-0 text-18 font-600" id="settings-identity-title">
                      {t.identity.title}
                    </h2>
                    <p className="m-0 text-13 text-ink-muted" data-testid="profile-created">
                      {t.identity.created(
                        createdLabel(state.createdAt),
                        fr.shell.header.activeFormations(state.activeFormationCount),
                      )}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-14">
                  <TextField
                    autoComplete="given-name"
                    data-testid="profile-first-name"
                    label={t.identity.firstName}
                    maxLength={60}
                    onChange={(event) => {
                      setValues((previous) => ({ ...previous, firstName: event.target.value }));
                      setSaved(false);
                      if (error !== null) setError(null);
                    }}
                    value={values.firstName}
                  />
                  <TextField
                    autoComplete="family-name"
                    data-testid="profile-last-name"
                    label={t.identity.lastName}
                    maxLength={60}
                    onChange={(event) => {
                      setValues((previous) => ({ ...previous, lastName: event.target.value }));
                      setSaved(false);
                      if (error !== null) setError(null);
                    }}
                    value={values.lastName}
                  />
                  <TextField
                    aria-readonly
                    className="col-span-full"
                    data-testid="profile-email"
                    label={t.identity.email}
                    hint={t.identity.emailHint}
                    readOnly
                    type="email"
                    value={me.email}
                  />
                  <Select
                    data-testid="profile-language"
                    hint={onboardingT.profil.languageHint}
                    label={t.identity.language}
                    onChange={(event) => {
                      setValues((previous) => ({
                        ...previous,
                        courseLanguage: event.target.value as CourseLanguage,
                      }));
                      setSaved(false);
                    }}
                    options={(['fr', 'en', 'es', 'de'] as const).map((code) => ({
                      value: code,
                      label: onboardingT.profil.languages[code],
                    }))}
                    value={values.courseLanguage}
                  />
                  <Select
                    data-testid="profile-tone"
                    label={t.identity.toneLabel}
                    onChange={(event) => {
                      setValues((previous) => ({
                        ...previous,
                        tutorTone: event.target.value as TutorTone,
                      }));
                      setSaved(false);
                    }}
                    options={[
                      { value: 'vous', label: t.identity.toneVous },
                      { value: 'tu', label: t.identity.toneTu },
                    ]}
                    value={values.tutorTone}
                  />
                  <Select
                    data-testid="profile-timezone"
                    label={t.identity.timezone}
                    onChange={(event) => {
                      setValues((previous) => ({ ...previous, timezone: event.target.value }));
                      setSaved(false);
                    }}
                    options={timezoneOptions(values.timezone)}
                    value={values.timezone}
                  />
                </div>
              </Card>
              <Card
                className="flex min-w-0 flex-[1_1_420px] flex-col gap-18"
                data-testid="profile-rhythm"
              >
                <div className="flex flex-col gap-2">
                  <h2 className="m-0 text-18 font-600">{t.rhythm.title}</h2>
                  <p className="m-0 text-13 text-ink-muted">{t.rhythm.subtitle}</p>
                </div>
                <div className="flex flex-col gap-8">
                  <span className="text-13 font-700" id="settings-hours-label">
                    {onboardingT.rythme.hoursLabel}
                  </span>
                  <div
                    aria-labelledby="settings-hours-label"
                    className="flex flex-wrap gap-6"
                    role="group"
                  >
                    {HOURS.map((hours) => (
                      <button
                        aria-pressed={rhythm.hoursPerDay === hours}
                        className={chipClass(rhythm.hoursPerDay === hours)}
                        data-testid={`profile-hours-${String(hours)}`}
                        key={hours}
                        onClick={() => {
                          setValues((previous) => ({
                            ...previous,
                            rhythm: { ...previous.rhythm, hoursPerDay: hours },
                          }));
                          setSaved(false);
                        }}
                        type="button"
                      >
                        {onboardingT.rythme.hours(hours)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-8">
                  <span className="text-13 font-700" id="settings-days-label">
                    {onboardingT.rythme.daysLabel}
                  </span>
                  <div
                    aria-labelledby="settings-days-label"
                    className="flex flex-wrap gap-6"
                    role="group"
                  >
                    {DAYS.map((day) => (
                      <button
                        aria-label={onboardingT.rythme.dayLabels[day]}
                        aria-pressed={rhythm.studyDays.includes(day)}
                        className={chipClass(rhythm.studyDays.includes(day))}
                        data-testid={`profile-day-${String(day)}`}
                        key={day}
                        onClick={() => {
                          setValues((previous) => ({
                            ...previous,
                            rhythm: {
                              ...previous.rhythm,
                              studyDays: toggleStudyDay(previous.rhythm.studyDays, day),
                            },
                          }));
                          setSaved(false);
                        }}
                        type="button"
                      >
                        {onboardingT.rythme.dayShort[day]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-8">
                  <span className="text-13 font-700" id="settings-slots-label">
                    {onboardingT.rythme.slotsLabel}
                  </span>
                  <div
                    aria-labelledby="settings-slots-label"
                    className="flex flex-wrap gap-6"
                    role="group"
                  >
                    {SLOTS.map((slot) => (
                      <button
                        aria-pressed={rhythm.preferredSlots.includes(slot)}
                        className={chipClass(rhythm.preferredSlots.includes(slot))}
                        data-testid={`profile-slot-${slot}`}
                        key={slot}
                        onClick={() => {
                          setValues((previous) => ({
                            ...previous,
                            rhythm: {
                              ...previous.rhythm,
                              preferredSlots: togglePreferredSlot(
                                previous.rhythm.preferredSlots,
                                slot,
                              ),
                            },
                          }));
                          setSaved(false);
                        }}
                        type="button"
                      >
                        {onboardingT.rythme.slots[slot]}
                      </button>
                    ))}
                  </div>
                </div>
                <p
                  aria-live="polite"
                  className="m-0 rounded-14 bg-canvas px-14 py-12 text-14 leading-1.5"
                  data-testid="profile-rhythm-summary"
                >
                  {rhythmSummary(rhythm)}
                </p>
              </Card>
            </div>

            <Card
              className="flex flex-wrap items-center justify-between gap-16"
              data-testid="data-privacy"
            >
              <div className="flex min-w-0 flex-col gap-2">
                <h2 className="m-0 text-18 font-600">{t.privacy.title}</h2>
                <p className="m-0 text-13 text-ink-muted">{t.privacy.description}</p>
              </div>
              <div className="flex flex-wrap gap-8">
                <AlertDialog
                  cancelLabel="Annuler"
                  confirmLabel={t.privacy.exportConfirm}
                  data-testid="data-export-dialog"
                  description={t.privacy.exportDescription}
                  onConfirm={() => {
                    void requestExport();
                  }}
                  title={t.privacy.exportTitle}
                  trigger={
                    <Button data-testid="data-export" disabled={privacyBusy} variant="outline">
                      {t.privacy.exportTrigger}
                    </Button>
                  }
                />
                {deletionScheduledFor === null ? (
                  <AlertDialog
                    cancelLabel="Annuler"
                    confirmLabel={t.privacy.deleteConfirm}
                    data-testid="account-delete-dialog"
                    description={longDateTimeLabel(jPlus30(clock.now().toISOString()), me.timezone)}
                    onConfirm={() => {
                      void scheduleDeletion();
                    }}
                    title={t.privacy.deleteTitle}
                    trigger={
                      <Button data-testid="account-delete" disabled={privacyBusy} variant="danger">
                        {t.privacy.deleteTrigger}
                      </Button>
                    }
                  />
                ) : null}
              </div>
            </Card>

            {exportState === null && deletionScheduledFor === null ? null : (
              <div
                className="flex flex-col gap-8 rounded-24 border border-solid border-border bg-surface px-24 py-16"
                data-testid="privacy-state"
              >
                <p
                  className="m-0 flex flex-wrap items-center gap-8 text-14 font-600"
                  data-testid="data-export-status"
                  role="status"
                >
                  {exportState === null
                    ? t.privacy.exportNone
                    : exportStatusLabel(exportState.status)}
                  {exportState?.status === 'done' ? (
                    <>
                      <a
                        className="text-14 font-700 text-ink underline"
                        data-testid="data-export-download"
                        href={`/api/v1/me/exports/${exportState.id}?download=1`}
                      >
                        {t.privacy.download}
                      </a>
                      <span className="font-400 text-ink-muted">
                        {t.privacy.size(sizeOf(exportState.sizeBytes))}{' '}
                        {exportState.expiresAt === null
                          ? null
                          : t.privacy.expires(dayDateLabel(exportState.expiresAt, me.timezone))}
                      </span>
                    </>
                  ) : null}
                </p>
                <p
                  className="m-0 flex flex-wrap items-center gap-12 text-14 font-600"
                  data-testid="deletion-status"
                  role="status"
                >
                  {deletionScheduledFor === null
                    ? t.privacy.deleteNone
                    : t.privacy.deleteScheduled(
                        longDateTimeLabel(deletionScheduledFor, me.timezone),
                      )}
                  {deletionScheduledFor === null ? null : (
                    <Button
                      data-testid="deletion-cancel"
                      disabled={privacyBusy}
                      onClick={() => {
                        void cancelDeletion();
                      }}
                      size="sm"
                      variant="outline"
                    >
                      {t.privacy.cancelTrigger}
                    </Button>
                  )}
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-end gap-12">
              {error === null ? null : <FormError data-testid="profile-error">{error}</FormError>}
              {saved ? (
                <span
                  className="text-14 font-600 text-green-ink"
                  data-testid="profile-save-status"
                  role="status"
                >
                  {t.saved}
                </span>
              ) : null}
              <Button
                data-testid="profile-save"
                loading={saving}
                onClick={() => {
                  void save();
                }}
                size="lg"
                type="button"
                variant="dark"
              >
                {t.save}
              </Button>
            </div>
          </div>
        </TabsContent>

        {(['notifications', 'automatismes', 'modeles'] as const).map((id) => (
          <TabsContent className="mt-0" key={id} value={id}>
            <Card as="section" data-testid={`settings-panel-${id}`}>
              <div className="flex items-start gap-12">
                <AlertTriangle aria-hidden className="mt-2 size-20 text-ink-muted" />
                <p className="m-0 text-14 text-ink-muted">{t.coming[id]}</p>
              </div>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </main>
  );
}

/** BR-ACC-11 — J+30 of the current instant, in milliseconds. */
function jPlus30(fromIso: string): string {
  return new Date(new Date(fromIso).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
}
