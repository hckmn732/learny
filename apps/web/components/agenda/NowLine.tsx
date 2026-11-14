'use client';

// Orange line of the current local hour (SPEC-704 EF-12, BR-AGE-07, CL-2). The position follows
// the wall clock of the learner's zone and refreshes every 60 s through the injected clock
// (ADR-0047): the browser clock is frozen in test, the server never reads the process time.
import { useEffect, useState } from 'react';

import { clock, toUserZone } from '@learny/core';

export interface NowLineProps {
  timezone: string;
  /** Grid start hour (ET-6). */
  gridStartHour: number;
  /** Grid end hour: the line hides outside the displayed range. */
  gridEndHour: number;
  visible: boolean;
}

export function NowLine({ timezone, gridStartHour, gridEndHour, visible }: NowLineProps) {
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
  }, [timezone]);

  if (!visible || minutes === null) return null;
  const top = (minutes / 60 - gridStartHour) * 60;
  if (top < 0 || top >= (gridEndHour - gridStartHour) * 60) return null;

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
