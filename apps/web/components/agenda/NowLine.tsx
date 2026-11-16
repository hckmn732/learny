'use client';

// Orange line of the current local hour (SPEC-704 EF-12, BR-AGE-07, CL-2). The position follows
// the wall clock of the learner's zone and refreshes every 60 s through the injected clock
// (ADR-0047). The screen hands the clock anchored on the server instant (`anchoredClock`): the
// browser time alone would place the line on the device hour, not on the application hour.
import { useEffect, useState } from 'react';

import { clock as defaultClock, toUserZone, type Clock } from '@learny/core';

import { nowLineTop } from '../../lib/agenda/grid';

export interface NowLineProps {
  timezone: string;
  /** Grid start hour (ET-6). */
  gridStartHour: number;
  /** Grid end hour: the line hides outside the displayed range. */
  gridEndHour: number;
  visible: boolean;
  /** Application clock; defaults to the injectable clock of `@learny/core`. */
  clock?: Clock | undefined;
}

export function NowLine({
  timezone,
  gridStartHour,
  gridEndHour,
  visible,
  clock = defaultClock,
}: NowLineProps) {
  const [minutes, setMinutes] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const wall = toUserZone(clock.now(), timezone);
      setMinutes(wall.hour * 60 + wall.minute);
    };
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [timezone, clock]);

  if (!visible || minutes === null) return null;
  const top = nowLineTop(minutes, gridStartHour, gridEndHour);
  if (top === null) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="agenda-now-line"
      className="absolute right-0 left-0 z-2 h-2 bg-orange"
      style={{ top }}
    >
      <span className="absolute top-[-4px] left-[-5px] size-10 rounded-full bg-orange" />
    </div>
  );
}
