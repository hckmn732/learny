// Application clock of the agenda on the client (SPEC-704 EF-9, EF-12; ADR-0047). The server
// clock (`CLOCK_FIXED_AT` in test and QA) is the reference instant of the screen: the browser
// clock only measures the time elapsed since the page was rendered, so the now line and the
// default selection agree with the rest of the application (home, API) whatever the device time.
import type { Clock } from '@learny/core';

/**
 * Clock anchored on the server instant `serverNowIso`: it returns that instant plus the time
 * elapsed on `reference` since the call. A server and a browser frozen on the same instant give a
 * frozen clock; an unfrozen browser makes it advance from the server instant.
 */
export function anchoredClock(serverNowIso: string, reference: Clock): Clock {
  const serverMs = new Date(serverNowIso).getTime();
  if (Number.isNaN(serverMs)) return reference;
  const offsetMs = serverMs - reference.now().getTime();
  return { now: () => new Date(reference.now().getTime() + offsetMs) };
}
