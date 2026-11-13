// Server-authoritative exam timer (SPEC-502 EF-7, CL-8, BR-PRA-03). The caller passes the server
// instant (`clock.now()`); the function never reads the system clock.
export interface TimerState {
  remainingMs: number;
  display: string;
  warning: boolean;
  expired: boolean;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `mm:ss`, or `h:mm:ss` beyond 59:59 (EF-7). */
export function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${String(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function timerState(input: {
  startedAt: Date;
  durationSec: number;
  warnAtSec: number;
  now: Date;
}): TimerState {
  const totalMs = input.durationSec * 1000;
  const elapsedMs = input.now.getTime() - input.startedAt.getTime();
  // A clock set back before the start never grants more than the initial duration (CL-8).
  const remainingMs = Math.min(totalMs, Math.max(0, totalMs - elapsedMs));
  const expired = remainingMs === 0;
  return {
    remainingMs,
    display: formatRemaining(remainingMs),
    // Orange strictly under the warning threshold; an expired timer reports `expired` instead.
    warning: !expired && remainingMs < input.warnAtSec * 1000,
    expired,
  };
}
