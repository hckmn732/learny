import {
  DEFAULT_QUIET_HOURS,
  DEFAULT_TIME_ZONE,
  clock,
  formatUserDate,
  instantsAtLocalTime,
  isQuietHours,
  nextOutsideQuietHours,
  toUserZone,
  userDayBounds,
} from '@learny/core';

import { fr } from '../../messages/fr';
import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

const t = fr.sdd.spec207;
const HOUR_MS = 3_600_000;

// Every value below comes from @learny/core/time: the page holds no result string (SPEC-207 §10).
const iso = (date: Date) => date.toISOString().replace(/\.000Z$/, 'Z');

interface ClockChange {
  day: string;
  hours: number;
  start: Date;
  end: Date;
}

/** Days of the local year that do not last 24 hours, found by walking the day bounds. */
function clockChangesOf(year: number, timeZone: string): ClockChange[] {
  const changes: ClockChange[] = [];
  let day = `${String(year)}-01-01`;
  while (day.startsWith(String(year))) {
    const { start, end } = userDayBounds(day, timeZone);
    const hours = (end.getTime() - start.getTime()) / HOUR_MS;
    if (hours !== 24) changes.push({ day, hours, start, end });
    // The end bound belongs to the next day (half-open interval).
    day = toUserZone(end, timeZone).date;
  }
  return changes;
}

function Row({
  label,
  testId,
  children,
}: Readonly<{ label: string; testId?: string; children: string }>) {
  return (
    <div className="flex flex-wrap gap-x-2 text-sm">
      <dt className="font-semibold">{label}</dt>
      <dd data-testid={testId}>{children}</dd>
    </div>
  );
}

function QuietExample({
  testId,
  label,
  instant,
}: Readonly<{ testId: string; label: string; instant: Date }>) {
  const window = { ...DEFAULT_QUIET_HOURS, timeZone: DEFAULT_TIME_ZONE };
  const quiet = isQuietHours(instant, window);
  const next = nextOutsideQuietHours(instant, window);
  return (
    <li data-testid={testId} className="rounded-[12px] bg-[#F4F4F1] p-4">
      <p className="font-semibold">{`${label} · ${toUserZone(instant, DEFAULT_TIME_ZONE).time}`}</p>
      <dl className="mt-2 space-y-1">
        <Row label={t.quiet.state} testId={`${testId}-state`}>
          {quiet ? t.quiet.quiet : t.quiet.allowed}
        </Row>
        <Row label={t.quiet.next} testId={`${testId}-next`}>
          {formatUserDate(next, DEFAULT_TIME_ZONE)}
        </Row>
      </dl>
    </li>
  );
}

function ChangeCard({
  testId,
  title,
  change,
}: Readonly<{ testId: string; title: string; change: ClockChange }>) {
  const occurrences = instantsAtLocalTime(change.day, '02:30', DEFAULT_TIME_ZONE).length;
  return (
    <article data-testid={testId} className="rounded-[12px] bg-[#F4F4F1] p-4">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm">
        {formatUserDate(change.start, DEFAULT_TIME_ZONE, { dateStyle: 'full' })}
      </p>
      <p data-testid={`${testId}-hours`} className="mt-2 font-display text-2xl font-semibold">
        {t.dst.hours(change.hours)}
      </p>
      <dl className="mt-2 space-y-1">
        <Row label={t.dst.start}>{iso(change.start)}</Row>
        <Row label={t.dst.end}>{iso(change.end)}</Row>
      </dl>
      <p data-testid={`${testId}-0230`} className="mt-2 text-sm">
        {t.dst.occurrences('02:30', occurrences)}
      </p>
    </article>
  );
}

export default function Spec207Demo() {
  const now = clock.now();
  const local = toUserZone(now, DEFAULT_TIME_ZONE);
  const today = userDayBounds(local.date, local.timeZone);
  const quietRange = `${DEFAULT_QUIET_HOURS.start}–${DEFAULT_QUIET_HOURS.end}`;
  const [evening] = instantsAtLocalTime(local.date, DEFAULT_QUIET_HOURS.start, DEFAULT_TIME_ZONE);
  const changes = clockChangesOf(local.year, DEFAULT_TIME_ZONE);
  const spring = changes.find((change) => change.hours < 24);
  const autumn = changes.find((change) => change.hours > 24);

  return (
    <>
      <BaseTokenStyle />
      <BaseCard testId="spec-207-now" title={t.now.title}>
        <dl className="space-y-1">
          <Row label={t.now.utc} testId="spec-207-now-utc">
            {iso(now)}
          </Row>
          <Row label={t.now.clock}>{t.now.clockValue}</Row>
        </dl>
      </BaseCard>
      <BaseCard testId="spec-207-local" title={t.local.title}>
        <dl className="space-y-1">
          <Row label={t.local.zone} testId="spec-207-local-zone">
            {local.timeZone}
          </Row>
          <Row label={t.local.time(local.timeZone)} testId="spec-207-local-time">
            {local.time}
          </Row>
          <Row label={t.local.date} testId="spec-207-local-date">
            {formatUserDate(now, local.timeZone, { dateStyle: 'full' })}
          </Row>
          <Row label={t.local.weekday} testId="spec-207-local-weekday">
            {String(local.weekday)}
          </Row>
          <Row label={t.local.offset} testId="spec-207-local-offset">
            {`UTC${local.offset}`}
          </Row>
          <Row label={t.local.name} testId="spec-207-local-name">
            {local.zoneName}
          </Row>
          <Row label={t.local.dayStart} testId="spec-207-local-start">
            {iso(today.start)}
          </Row>
          <Row label={t.local.dayEnd} testId="spec-207-local-end">
            {iso(today.end)}
          </Row>
        </dl>
      </BaseCard>
      <BaseCard testId="spec-207-quiet" title={t.quiet.title(quietRange)}>
        <p className="mb-3 text-sm">{t.quiet.intro}</p>
        <ul className="space-y-3">
          <QuietExample testId="spec-207-quiet-now" label={t.quiet.now} instant={now} />
          {evening === undefined ? null : (
            <QuietExample
              testId="spec-207-quiet-evening"
              label={t.quiet.evening}
              instant={evening}
            />
          )}
        </ul>
      </BaseCard>
      <BaseCard testId="spec-207-dst" title={t.dst.title(DEFAULT_TIME_ZONE, local.year)}>
        <p className="mb-3 text-sm">{t.dst.intro}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {spring === undefined ? null : (
            <ChangeCard testId="spec-207-dst-spring" title={t.dst.spring} change={spring} />
          )}
          {autumn === undefined ? null : (
            <ChangeCard testId="spec-207-dst-autumn" title={t.dst.autumn} change={autumn} />
          )}
        </div>
      </BaseCard>
    </>
  );
}
