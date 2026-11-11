// The only module allowed to read the system time (ADR-0047).
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(Date.now()),
};

function fixedClock(at: Date): Clock {
  const ms = at.getTime();
  return { now: () => new Date(ms) };
}

const ISO_DATE =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)?)?$/;

export function createClockFromEnv(
  env: Record<string, string | undefined> = process.env,
): Clock {
  const value = env.CLOCK_FIXED_AT;
  if (value === undefined || value === '') return systemClock;
  const at = new Date(value);
  if (!ISO_DATE.test(value) || Number.isNaN(at.getTime())) {
    throw new Error(`CLOCK_FIXED_AT invalide : ${value}`);
  }
  return fixedClock(at);
}

// eslint-disable-next-line import/no-mutable-exports -- replaced by setClock() in tests
export let clock: Clock = createClockFromEnv(process.env);

export function setClock(c: Clock): void {
  clock = c;
}
