'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import type { StudyPreferencesDto, StudySlot } from '@learny/contracts';
import { Button, Card, FormError } from '@learny/ui';
import { cn } from '@learny/ui';

import { api } from '../../lib/api-client';
import { fr } from '../../messages/fr';

import {
  rhythmSummary,
  togglePreferredSlot,
  toggleStudyDay,
  type RhythmValues,
} from './RhythmSummary';
import { StepHeading } from './StepHeading';

const t = fr.onboarding;
const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const SLOTS: StudySlot[] = ['matin', 'apres_midi', 'soir'];
const HOURS = [1, 2, 3, 4, 5, 6] as const;

function chipClass(selected: boolean): string {
  return cn(
    'min-h-40 cursor-pointer rounded-12 border border-solid px-14 text-14',
    selected
      ? 'border-ink bg-ink font-700 text-white'
      : 'border-border-strong bg-surface font-500 text-ink',
  );
}

/** SPEC-602 EF-4 — rhythm step, with the invariant « at least one day and one moment ». */
export function RhythmStep({ initial }: Readonly<{ initial: StudyPreferencesDto }>) {
  const router = useRouter();
  const [values, setValues] = useState<RhythmValues>({
    hoursPerDay: initial.hoursPerDay,
    studyDays: [...initial.studyDays],
    preferredSlots: [...initial.preferredSlots],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hoursId = useId();
  const daysId = useId();
  const slotsId = useId();

  const save = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.mePreferencesUpdate({ body: values });
      await api.meOnboardingUpdate({ body: { step: 'ia' } });
      router.push('/premiers-pas/ia');
      router.refresh();
    } catch {
      setError(t.common.saveError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex flex-col gap-24" data-testid="onboarding-step-rythme">
      <button
        className="self-start text-14 font-600 text-ink-muted"
        data-testid="onboarding-back"
        onClick={() => {
          router.push('/premiers-pas/profil');
        }}
        type="button"
      >
        ‹ {t.common.back}
      </button>
      <StepHeading subtitle={t.rythme.subtitle} title={t.rythme.title} />
      <Card className="flex flex-col gap-18">
        <div className="flex flex-col gap-8">
          <span className="text-13 font-700" id={hoursId}>
            {t.rythme.hoursLabel}
          </span>
          <div aria-labelledby={hoursId} className="flex flex-wrap gap-6" role="group">
            {HOURS.map((hours) => (
              <button
                aria-pressed={values.hoursPerDay === hours}
                className={chipClass(values.hoursPerDay === hours)}
                data-testid={`hours-${String(hours)}`}
                key={hours}
                onClick={() => {
                  setValues((previous) => ({ ...previous, hoursPerDay: hours }));
                }}
                type="button"
              >
                {t.rythme.hours(hours)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-8">
          <span className="text-13 font-700" id={daysId}>
            {t.rythme.daysLabel}
          </span>
          <div aria-labelledby={daysId} className="flex flex-wrap gap-6" role="group">
            {DAYS.map((day) => (
              <button
                aria-label={t.rythme.dayLabels[day]}
                aria-pressed={values.studyDays.includes(day)}
                className={chipClass(values.studyDays.includes(day))}
                data-testid={`day-${String(day)}`}
                key={day}
                onClick={() => {
                  setValues((previous) => ({
                    ...previous,
                    studyDays: toggleStudyDay(previous.studyDays, day),
                  }));
                }}
                type="button"
              >
                {t.rythme.dayShort[day]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-8">
          <span className="text-13 font-700" id={slotsId}>
            {t.rythme.slotsLabel}
          </span>
          <div aria-labelledby={slotsId} className="flex flex-wrap gap-6" role="group">
            {SLOTS.map((slot) => (
              <button
                aria-pressed={values.preferredSlots.includes(slot)}
                className={chipClass(values.preferredSlots.includes(slot))}
                data-testid={`slot-${slot}`}
                key={slot}
                onClick={() => {
                  setValues((previous) => ({
                    ...previous,
                    preferredSlots: togglePreferredSlot(previous.preferredSlots, slot),
                  }));
                }}
                type="button"
              >
                {t.rythme.slots[slot]}
              </button>
            ))}
          </div>
        </div>
        <p
          aria-live="polite"
          className="m-0 rounded-14 bg-canvas px-14 py-12 text-14"
          data-testid="rhythm-summary"
        >
          {rhythmSummary(values)}
        </p>
        {error === null ? null : <FormError data-testid="rhythm-error">{error}</FormError>}
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
