// Timer state (SPEC-502 ET-5, reused by SPEC-503 EF-13). The server clock is authoritative:
// callers pass `now`, the view never reads the system time by itself.
export interface TimerStateInput {
  startedAt: Date;
  durationSec: number;
  warnAtSec: number;
  now: Date;
}

export interface TimerState {
  remainingMs: number;
  display: string;
  warning: boolean;
  expired: boolean;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function timerState({
  startedAt,
  durationSec,
  warnAtSec,
  now,
}: TimerStateInput): TimerState {
  const totalMs = durationSec * 1000;
  const elapsed = Math.max(0, now.getTime() - startedAt.getTime());
  const remainingMs = Math.max(0, totalMs - elapsed);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const display =
    hours > 0
      ? `${String(hours)}:${pad(minutes)}:${pad(seconds)}`
      : `${pad(minutes)}:${pad(seconds)}`;
  return {
    remainingMs,
    display,
    warning: remainingMs < warnAtSec * 1000 && remainingMs > 0,
    expired: remainingMs === 0,
  };
}
