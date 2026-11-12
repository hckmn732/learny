import type { Clock } from '@learny/core';

// Reference instant of every deterministic test (ADR-0047): 13:20 in Europe/Paris.
export const FIXED_TIME_ISO = '2026-11-11T12:20:00Z';
// Canonical form of the same instant (SPEC-401 ET-7): instant strings of the engine always carry
// milliseconds, so fixtures and generated samples compare exactly.
export const REFERENCE_NOW = '2026-11-11T12:20:00.000Z';
export const DISPLAY_TIME_ZONE = 'Europe/Paris';

const ISO_INSTANT =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/;

/** Frozen clock; each call returns a new Date so a caller cannot move the shared instant. */
export function createFixedClock(iso: string = FIXED_TIME_ISO): Clock {
  const ms = ISO_INSTANT.test(iso) ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(ms)) throw new Error(`Instant ISO invalide pour createFixedClock : ${iso}`);
  return { now: () => new Date(ms) };
}
