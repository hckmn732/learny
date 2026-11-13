'use client';

import { useSyncExternalStore } from 'react';

import { clock } from '@learny/core';

/**
 * Client clock of the authentication screens (SPEC-601 ET-9, ADR-0047). `clock.now()` is the only
 * allowed read of the system time; the browser tests freeze it with `page.clock`, and the resend
 * countdown therefore advances deterministically. The server snapshot is `null`, so the first
 * client render matches the server and the real time only appears after hydration.
 */
const TICK_MS = 1000;

function subscribe(onChange: () => void): () => void {
  const timer = setInterval(onChange, TICK_MS);
  return () => {
    clearInterval(timer);
  };
}

/** Second-resolution instant: a primitive snapshot, safe for `useSyncExternalStore`. */
function snapshot(): number {
  return Math.floor(clock.now().getTime() / TICK_MS);
}

function serverSnapshot(): null {
  return null;
}

export function useClock(): Date | null {
  const seconds = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return seconds === null ? null : new Date(seconds * TICK_MS);
}
