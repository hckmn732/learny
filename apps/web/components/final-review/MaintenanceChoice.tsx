'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { FinalReviewDto } from '@learny/contracts';
import { ChoiceGroup } from '@learny/ui';

import { api } from '../../lib/api-client';
import { fr } from '../../messages/fr';

const t = fr.finalReview;

type Mode = 'light' | 'stopped';

function isMode(value: string): value is Mode {
  return value === 'light' || value === 'stopped';
}

export interface MaintenanceChoiceProps {
  initial: FinalReviewDto;
}

/**
 * Memory-interview choice of SCR-16 (SPEC-617 EF-2, CA-2). The current mode is a radio group so
 * the keyboard follows the ARIA radio pattern; every change is one idempotent mutation guarded by
 * the object version read by the server, and the status line is announced politely.
 */
export function MaintenanceChoice({ initial }: MaintenanceChoiceProps) {
  const router = useRouter();
  const [current, setCurrent] = useState(initial);
  const [mode, setMode] = useState<Mode | null>(initial.maintenance.mode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const choose = async (value: string) => {
    if (!isMode(value)) return;
    if (value === current.maintenance.mode) {
      setMode(value);
      return;
    }
    const previous = mode;
    setMode(value);
    setSaving(true);
    setError(false);
    try {
      const next = await api.setMaintenance({
        params: { fid: current.formationId },
        body: { mode: value, expectedUpdatedAt: current.updatedAt },
      });
      setCurrent(next);
      setMode(next.maintenance.mode);
      router.refresh();
    } catch {
      setMode(previous);
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const status =
    mode === 'light'
      ? t.maintenance.currentLight
      : mode === 'stopped'
        ? t.maintenance.currentStopped
        : t.maintenance.currentNone;
  const effects =
    mode === 'light'
      ? t.maintenance.effects.light
      : mode === 'stopped'
        ? t.maintenance.effects.stopped
        : t.maintenance.effects.none;

  return (
    <section
      data-testid="maintenance-mode"
      aria-labelledby="maintenance-mode-title"
      className="flex flex-col gap-14 rounded-24 border border-solid border-border bg-surface px-24 py-22"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-10">
        <h2
          id="maintenance-mode-title"
          className="m-0 font-display text-22 font-600 tracking-heading"
        >
          {t.maintenance.title}
        </h2>
        <span className="text-13 text-ink-muted">{t.maintenance.due(current.dueCount)}</span>
      </div>
      <p className="m-0 text-13 leading-1.5 text-ink-muted">{t.maintenance.description}</p>
      <ChoiceGroup
        aria-label={t.maintenance.title}
        value={mode ?? ''}
        onValueChange={(value) => {
          void choose(value);
        }}
        options={[
          {
            value: 'light',
            label: t.maintenance.light,
            description: t.maintenance.lightDescription,
            testId: 'maintenance-light',
            disabled: saving,
          },
          {
            value: 'stopped',
            label: t.maintenance.stopped,
            description: t.maintenance.stoppedDescription,
            testId: 'maintenance-stopped',
            disabled: saving,
          },
        ]}
      />
      <p
        role="status"
        aria-live="polite"
        data-testid="maintenance-status"
        className="m-0 rounded-14 bg-surface-subtle px-14 py-12 text-14 font-600"
      >
        {saving ? t.maintenance.saving : status}
      </p>
      <p className="m-0 text-13 leading-1.5 text-ink-muted">{effects}</p>
      {error ? (
        <p
          role="alert"
          data-testid="maintenance-error"
          className="m-0 rounded-14 border border-solid border-danger/40 bg-danger-soft px-14 py-10 text-13 font-600 text-danger"
        >
          {t.maintenance.error}
        </p>
      ) : null}
    </section>
  );
}
