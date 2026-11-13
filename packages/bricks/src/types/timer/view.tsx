'use client';

import { useEffect, useRef, useState } from 'react';

import { clock } from '@learny/core';
import { cn } from '@learny/ui';

import { resolveLabels } from '../../view/labels';
import type { BrickViewProps } from '../../view-types';

import { timerState } from './state';

function toDate(value: Date | string | undefined): Date {
  if (value === undefined) return clock.now();
  return typeof value === 'string' ? new Date(value) : value;
}

/** Exam countdown: dark, orange under the warning point, one assertive announcement (EF-13). */
export function TimerView({ brick, startedAt, now: fixedNow, labels }: BrickViewProps<'timer'>) {
  const t = resolveLabels(labels);
  const payload = brick.publicPayload;
  const [start] = useState<Date>(() => toDate(startedAt));
  const [now, setNow] = useState<Date>(() => fixedNow ?? clock.now());
  const announced = useRef(false);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (fixedNow) return;
    const interval = setInterval(() => {
      setNow(clock.now());
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, [fixedNow]);

  const effectiveNow = fixedNow ?? now;
  const state = timerState({
    startedAt: start,
    durationSec: payload.durationSec,
    warnAtSec: payload.warnAtSec,
    now: effectiveNow,
  });

  useEffect(() => {
    if (state.warning && !announced.current) {
      announced.current = true;
      setAnnouncement(t.timerWarning);
    }
  }, [state.warning, t.timerWarning]);

  const minutes = Math.floor(state.remainingMs / 60000);

  return (
    <div className="flex flex-col gap-6">
      <span
        aria-label={t.timerLabel(minutes)}
        className={cn(
          'inline-flex min-w-72 justify-center rounded-10 px-12 py-6 font-display text-20 font-600 tabular-nums',
          state.warning ? 'bg-orange text-ink' : 'bg-dark-750 text-white',
        )}
        data-testid="brick-timer"
        role="timer"
      >
        {state.display}
      </span>
      <span aria-live="assertive" className="sr-only" data-testid="brick-timer-announcement">
        {announcement}
      </span>
    </div>
  );
}
