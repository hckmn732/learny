// The only clock of the application (SPEC-3001 ET-4, ADR-0047). Every screen reads the time
// through `clock.now()`; `Date.now()` and `new Date()` are refused by ESLint elsewhere.
import { type Clock, createClockFromEnv, zonedParts } from '@learny/core';

import { configResult } from '../config';

/** Default display zone of the application (the user's zone comes from `/me` later, BR-ACC-07). */
export const APP_TIME_ZONE = 'Europe/Paris';

/**
 * Builds the clock of the application: frozen at `EXPO_PUBLIC_CLOCK_FIXED_AT` when the build is a
 * test build (ADR-3004 § 7), otherwise the system clock.
 */
export function createAppClock(fixedAt: string | null): Clock {
  return createClockFromEnv(fixedAt === null ? {} : { CLOCK_FIXED_AT: fixedAt });
}

/** Fixed instant of the e2e and Jest builds: 2026-11-11T12:20:00Z, i.e. 13:20 in Paris. */
export const DEFAULT_FIXED_AT = '2026-11-11T12:20:00Z';

/** The clock of this build. */
export const clock: Clock = createAppClock(
  configResult.ok ? configResult.config.clockFixedAt : null,
);

/** `HH:MM` of `instant` in `timeZone` — pure arithmetic on the zone offset, never Intl output. */
export function formatClockTime(instant: Date, timeZone: string = APP_TIME_ZONE): string {
  const parts = zonedParts(instant, timeZone);
  const hour = String(parts.hour).padStart(2, '0');
  const minute = String(parts.minute).padStart(2, '0');
  return `${hour}:${minute}`;
}

/** Current time of the application, formatted in the display zone. */
export function nowLabel(timeZone: string = APP_TIME_ZONE): string {
  return formatClockTime(clock.now(), timeZone);
}
