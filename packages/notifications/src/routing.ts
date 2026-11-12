// Pure routing of one external delivery (SPEC-209 ET-3, EF-2, ADR-0214).
//
// One function decides, for one channel and one notification type, whether the delivery is sent,
// scheduled, deferred by the quiet hours or the weekend, capped by the daily limit or skipped by a
// preference. It reads no clock and touches no database: `now`, `timeZone` and `sentToday` are
// supplied by the caller, which makes the whole decision table testable (CA-1, CA-2).
import type { DeliveryChannel, NotificationType } from '@learny/contracts';
import {
  isQuietHours,
  localTimeToInstant,
  nextOutsideQuietHours,
  userLocalDay,
  userWeekday,
  type Instant,
} from '@learny/core';

export interface DeliverySettings {
  channelEmail: boolean;
  channelPush: boolean;
  typeRevision: boolean;
  typeValidation: boolean;
  typeCourse: boolean;
  typeGap: boolean;
  typePlanning: boolean;
  typeRelaunch: boolean;
  quietStart: string;
  quietEnd: string;
  weekendQuiet: boolean;
  maxPerDay: 3 | 5 | 8;
}

export interface DeliveryDecision {
  status: 'sent' | 'scheduled' | 'deferred_quiet' | 'capped' | 'skipped_pref';
  scheduledFor: Date | null;
  /** Safe code for a skipped delivery (`stale` for an obsolete deferred send). */
  error?: string;
}

export interface DecideDeliveryInput {
  channel: DeliveryChannel;
  type: NotificationType;
  settings: DeliverySettings;
  now: Instant;
  timeZone: string;
  /** Number of distinct notifications already sent during the local day. */
  sentToday: number;
  /** EF-2 — a future instant keeps the delivery scheduled instead of deciding now. */
  eligibleAt?: Date | null;
  /** BR-NOT-06, CL-5 — the notification was read: the deferred delivery is abandoned. */
  read?: boolean;
  /** BR-NOT-06 — a deferred delivery is abandoned after this instant. */
  staleAt?: Date | null;
}

const TYPE_SWITCH: Partial<Record<NotificationType, keyof DeliverySettings>> = {
  global_quiz_today: 'typeRevision',
  validation_soon: 'typeValidation',
  module_validated: 'typeValidation',
  course_ready: 'typeCourse',
  new_gap: 'typeGap',
  session_planned: 'typePlanning',
  session_to_reschedule: 'typePlanning',
  planning_adjusted: 'typePlanning',
  relaunch: 'typeRelaunch',
};

/** EF-3 — the preference switch of a type; `null` when the type is always active. */
export function typeSwitchOf(type: NotificationType): keyof DeliverySettings | null {
  return TYPE_SWITCH[type] ?? null;
}

function channelEnabled(settings: DeliverySettings, channel: DeliveryChannel): boolean {
  return channel === 'email' ? settings.channelEmail : settings.channelPush;
}

function typeEnabled(settings: DeliverySettings, type: NotificationType): boolean {
  const key = typeSwitchOf(type);
  return key === null ? true : settings[key] === true;
}

/**
 * EF-4, CL-9 — Monday, end of the quiet hours, in the learner's zone. When the quiet range is
 * empty (`start = end`, CL-10), the report is Monday at 00:00.
 */
function nextMondayQuietEnd(
  now: Date,
  timeZone: string,
  quietStart: string,
  quietEnd: string,
): Date {
  const empty = quietStart === quietEnd;
  const targetHour = empty ? '00:00' : quietEnd;
  let day = userLocalDay(now, timeZone);
  // At most seven days: the loop finds the next Monday in every calendar.
  for (let offset = 0; offset <= 7; offset += 1) {
    const [year, month, date] = day.split('-').map(Number) as [number, number, number];
    const candidate = new Date(Date.UTC(year, month - 1, date));
    const weekday = ((candidate.getUTCDay() + 6) % 7) + 1;
    if (weekday === 1 && offset > 0) return localTimeToInstant(day, targetHour, timeZone);
    candidate.setUTCDate(candidate.getUTCDate() + 1);
    day = candidate.toISOString().slice(0, 10);
  }
  return localTimeToInstant(day, targetHour, timeZone);
}

/**
 * EF-2, EF-3, EF-4, EF-5, CL-1, CL-2, CL-9, CL-10 — the single decision table of a delivery.
 * Order: preference, eligibility, weekend, quiet hours, daily cap, send.
 */
export function decideDelivery(input: DecideDeliveryInput): DeliveryDecision {
  const { channel, type, settings, timeZone } = input;
  const now = new Date(input.now);

  // 1. Channel and type preferences (BR-NOT-03).
  if (!channelEnabled(settings, channel) || !typeEnabled(settings, type)) {
    return { status: 'skipped_pref', scheduledFor: null };
  }

  // 2. A notification that is already obsolete never leaves the application.
  if (input.read === true) return { status: 'skipped_pref', scheduledFor: null, error: 'stale' };
  if (
    input.staleAt !== null &&
    input.staleAt !== undefined &&
    input.staleAt.getTime() <= now.getTime()
  ) {
    return { status: 'skipped_pref', scheduledFor: null, error: 'stale' };
  }

  // 3. A future eligibility instant is scheduled, not sent now.
  if (
    input.eligibleAt !== null &&
    input.eligibleAt !== undefined &&
    input.eligibleAt.getTime() > now.getTime()
  ) {
    return { status: 'scheduled', scheduledFor: new Date(input.eligibleAt.getTime()) };
  }

  // 4. Weekend: only the revisions due may leave the application (EF-4, CL-9).
  const weekday = userWeekday(now, timeZone);
  if (settings.weekendQuiet && weekday >= 6 && type !== 'global_quiz_today') {
    return {
      status: 'deferred_quiet',
      scheduledFor: nextMondayQuietEnd(now, timeZone, settings.quietStart, settings.quietEnd),
    };
  }

  // 5. Quiet hours (BR-NOT-06, CL-1, CL-6, CL-10).
  const quiet = { start: settings.quietStart, end: settings.quietEnd, timeZone };
  if (isQuietHours(now, quiet)) {
    return { status: 'deferred_quiet', scheduledFor: nextOutsideQuietHours(now, quiet) };
  }

  // 6. Daily cap: the programme du jour never counts nor is capped (EF-6, ADR-0214).
  if (type !== 'daily_digest' && input.sentToday >= settings.maxPerDay) {
    return { status: 'capped', scheduledFor: null };
  }

  return { status: 'sent', scheduledFor: null };
}
