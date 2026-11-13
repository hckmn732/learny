'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import type { CourseLanguage, TutorTone } from '@learny/contracts';
import { AppError } from '@learny/core';
import { Button, Card, FormError, Select, TextField } from '@learny/ui';
import { cn } from '@learny/ui';

import { api } from '../../lib/api-client';
import { fr } from '../../messages/fr';

import { StepHeading } from './StepHeading';

const t = fr.onboarding;

export interface ProfileStepProps {
  firstName: string | null;
  tutorTone: TutorTone;
  courseLanguage: CourseLanguage;
  timezone: string;
}

/** BR-ACC-07 — browser zone when it is a valid IANA name, otherwise the stored/default zone. */
export function detectedTimeZone(fallback: string): string {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const supported = Intl.supportedValuesOf('timeZone');
    if (detected !== '' && (detected === 'UTC' || supported.includes(detected))) return detected;
  } catch {
    // Older engines have no `supportedValuesOf`: keep the stored zone.
  }
  return fallback === '' ? 'Europe/Paris' : fallback;
}

/** SPEC-602 EF-3, BR-ACC-05 to BR-ACC-07 — profile step. */
export function ProfileStep(props: Readonly<ProfileStepProps>) {
  const router = useRouter();
  const [firstName, setFirstName] = useState(props.firstName ?? '');
  const [tone, setTone] = useState<TutorTone>(props.tutorTone);
  const [language, setLanguage] = useState<CourseLanguage>(props.courseLanguage);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toneLabelId = useId();
  const name = firstName.trim() || t.profil.fallbackName;

  const save = async (): Promise<void> => {
    if (saving) return;
    const clean = firstName.trim();
    if (clean === '') {
      setError(t.profil.firstNameRequired);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.meUpdate({
        body: {
          firstName: clean,
          tutorTone: tone,
          courseLanguage: language,
          timezone: detectedTimeZone(props.timezone),
        },
      });
      await api.meOnboardingUpdate({ body: { step: 'rythme' } });
      router.push('/premiers-pas/rythme');
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof AppError && cause.code === 'VALIDATION_FAILED'
          ? (cause.errors?.[0]?.message ?? t.common.saveError)
          : t.common.saveError,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex flex-col gap-24" data-testid="onboarding-step-profil">
      <StepHeading subtitle={t.profil.subtitle} title={t.profil.title} />
      <Card className="flex flex-col gap-18">
        <TextField
          autoComplete="given-name"
          data-testid="profile-first-name"
          label={t.profil.firstName}
          maxLength={60}
          onChange={(event) => {
            setFirstName(event.target.value);
            if (error !== null) setError(null);
          }}
          value={firstName}
        />
        <div className="flex flex-col gap-8">
          <span className="text-13 font-700" id={toneLabelId}>
            {t.profil.toneLabel}
          </span>
          <div aria-labelledby={toneLabelId} className="flex flex-wrap gap-6" role="group">
            {(
              [
                ['vous', t.profil.toneVous, 'tone-vous'],
                ['tu', t.profil.toneTu, 'tone-tu'],
              ] as const
            ).map(([value, label, testId]) => (
              <button
                aria-pressed={tone === value}
                className={cn(
                  'min-h-40 cursor-pointer rounded-12 border border-solid px-14 text-14',
                  tone === value
                    ? 'border-ink bg-ink font-700 text-white'
                    : 'border-border-strong bg-surface font-500 text-ink',
                )}
                data-testid={testId}
                key={value}
                onClick={() => {
                  setTone(value);
                }}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <p
            aria-live="polite"
            className="m-0 rounded-14 bg-canvas px-14 py-12 text-14 leading-1.5"
            data-testid="tone-preview"
          >
            <strong>{t.profil.previewLabel}</strong>{' '}
            {tone === 'tu' ? t.profil.previewTu(name) : t.profil.previewVous(name)}
          </p>
        </div>
        <Select
          data-testid="course-language"
          hint={t.profil.languageHint}
          label={t.profil.language}
          onChange={(event) => {
            setLanguage(event.target.value as CourseLanguage);
          }}
          options={[
            { value: 'fr', label: t.profil.languages.fr },
            { value: 'en', label: t.profil.languages.en },
            { value: 'es', label: t.profil.languages.es },
            { value: 'de', label: t.profil.languages.de },
          ]}
          value={language}
        />
        {error === null ? null : <FormError data-testid="profile-error">{error}</FormError>}
        <Button
          data-testid="onboarding-continue"
          fullWidth
          loading={saving}
          onClick={() => {
            void save();
          }}
          size="xl"
          type="button"
          variant="dark"
        >
          {t.common.continue}
        </Button>
      </Card>
    </section>
  );
}
