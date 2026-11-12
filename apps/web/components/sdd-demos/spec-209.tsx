'use client';

import { useState } from 'react';

import { DELIVERY_CHANNELS, DELIVERY_STATUSES, type DevNotifyOutput } from '@learny/contracts';

import { ApiError, api } from '../../lib/api-client';
import { fr } from '../../messages/fr';
import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

const t = fr.sdd.spec209;

const TYPES = [
  'validation_soon',
  'course_ready',
  'global_quiz_today',
  'new_gap',
  'session_planned',
  'module_validated',
  'session_to_reschedule',
  'weekly_review',
  'milestone',
  'ai_cost_alert',
  'ai_task_failed',
  'export_ready',
  'group_invitation',
  'daily_digest',
  'relaunch',
  'planning_adjusted',
] as const;

const TIMES = {
  wednesday: '2026-11-11T12:20:00.000Z',
  evening: '2026-11-11T21:30:00.000Z',
  saturday: '2026-11-14T09:00:00.000Z',
} as const;

type TimeKey = keyof typeof TIMES;

const buttonClass =
  'rounded-[12px] bg-ink px-4 py-2 text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';
const fieldClass =
  'mt-1 w-full rounded-[8px] border border-solid border-border bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2';

function dateLabel(instant: string | null): string {
  if (instant === null) return t.result.noDate;
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(instant));
}

function messageOf(error: unknown): string {
  return error instanceof ApiError ? `${error.code} : ${error.detail}` : String(error);
}

interface SettingsState {
  channelEmail: boolean;
  channelPush: boolean;
  quietStart: string;
  quietEnd: string;
  weekendQuiet: boolean;
  maxPerDay: 3 | 5 | 8;
  tone: 'vous' | 'tu';
}

function Toggle({
  label,
  checked,
  onChange,
  testId,
}: Readonly<{
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  testId: string;
}>) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        data-testid={testId}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        className="h-4 w-4"
      />
      {label}
    </label>
  );
}

export default function Spec209Demo() {
  const [settings, setSettings] = useState<SettingsState>({
    channelEmail: true,
    channelPush: true,
    quietStart: '21:00',
    quietEnd: '08:00',
    weekendQuiet: true,
    maxPerDay: 5,
    tone: 'vous',
  });
  const [type, setType] = useState<(typeof TYPES)[number]>('validation_soon');
  const [at, setAt] = useState<TimeKey>('wednesday');
  const [result, setResult] = useState<DevNotifyOutput | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const output = await api.devNotify({
        body: {
          type,
          tone: settings.tone,
          at: TIMES[at],
          settings: {
            channelEmail: settings.channelEmail,
            channelPush: settings.channelPush,
            typeRevision: true,
            typeValidation: true,
            typeCourse: true,
            typeGap: true,
            typePlanning: true,
            typeRelaunch: true,
            quietStart: settings.quietStart,
            quietEnd: settings.quietEnd,
            weekendQuiet: settings.weekendQuiet,
            maxPerDay: settings.maxPerDay,
          },
        },
      });
      setResult(output);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <BaseTokenStyle />
      <BaseCard testId="spec-209-settings" title={t.settings.title}>
        <div className="flex flex-wrap gap-6">
          <Toggle
            testId="spec-209-channel-email"
            label={t.settings.channelEmail}
            checked={settings.channelEmail}
            onChange={(value) => {
              setSettings((current) => ({ ...current, channelEmail: value }));
            }}
          />
          <Toggle
            testId="spec-209-channel-push"
            label={t.settings.channelPush}
            checked={settings.channelPush}
            onChange={(value) => {
              setSettings((current) => ({ ...current, channelPush: value }));
            }}
          />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            {t.settings.quietStart}
            <input
              type="time"
              value={settings.quietStart}
              data-testid="spec-209-quiet-start"
              onChange={(event) => {
                setSettings((current) => ({ ...current, quietStart: event.target.value }));
              }}
              className={fieldClass}
            />
          </label>
          <label className="text-sm">
            {t.settings.quietEnd}
            <input
              type="time"
              value={settings.quietEnd}
              data-testid="spec-209-quiet-end"
              onChange={(event) => {
                setSettings((current) => ({ ...current, quietEnd: event.target.value }));
              }}
              className={fieldClass}
            />
          </label>
        </div>
        <div className="mt-4">
          <Toggle
            testId="spec-209-weekend"
            label={t.settings.weekend}
            checked={settings.weekendQuiet}
            onChange={(value) => {
              setSettings((current) => ({ ...current, weekendQuiet: value }));
            }}
          />
        </div>
        <fieldset className="mt-4">
          <legend className="text-sm">{t.settings.cap}</legend>
          <div className="mt-2 inline-flex overflow-hidden rounded-[12px] border border-solid border-border">
            {([3, 5, 8] as const).map((cap) => (
              <label
                key={cap}
                className={`cursor-pointer px-4 py-2 text-sm ${
                  settings.maxPerDay === cap ? 'bg-ink text-white' : 'bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="spec-209-cap"
                  value={cap}
                  checked={settings.maxPerDay === cap}
                  data-testid={`spec-209-cap-${String(cap)}`}
                  onChange={() => {
                    setSettings((current) => ({ ...current, maxPerDay: cap }));
                  }}
                  className="sr-only"
                />
                {cap}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mt-4 block text-sm">
          {t.settings.tone}
          <select
            value={settings.tone}
            data-testid="spec-209-tone"
            onChange={(event) => {
              setSettings((current) => ({
                ...current,
                tone: event.target.value === 'tu' ? 'tu' : 'vous',
              }));
            }}
            className={fieldClass}
          >
            <option value="vous">{t.settings.tones.vous}</option>
            <option value="tu">{t.settings.tones.tu}</option>
          </select>
        </label>
      </BaseCard>

      <BaseCard testId="spec-209-send" title={t.send.title}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            {t.send.type}
            <select
              value={type}
              data-testid="spec-209-type"
              onChange={(event) => {
                setType(event.target.value as (typeof TYPES)[number]);
              }}
              className={fieldClass}
            >
              {TYPES.map((value) => (
                <option key={value} value={value}>
                  {t.types[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {t.send.at}
            <select
              value={at}
              data-testid="spec-209-at"
              onChange={(event) => {
                setAt(event.target.value as TimeKey);
              }}
              className={fieldClass}
            >
              {(Object.keys(TIMES) as TimeKey[]).map((value) => (
                <option key={value} value={value}>
                  {t.send.times[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          className={`${buttonClass} mt-4`}
          disabled={busy}
          onClick={() => void submit()}
        >
          {t.send.action}
        </button>
        {error === '' ? null : (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </BaseCard>

      <BaseCard testId="spec-209-result" title={t.result.title} role="status">
        {busy ? <p className="text-sm">{t.send.loading}</p> : null}
        {!busy && result === null ? <p className="text-sm">{t.result.empty}</p> : null}
        {!busy && result !== null ? (
          <>
            <article className="rounded-[16px] border border-solid border-border p-4">
              <p className="text-xs uppercase tracking-wide">
                {result.created ? t.result.created : t.result.deduplicated}
              </p>
              <h3 className="mt-2 font-display text-lg font-semibold">
                {result.notification.title}
              </h3>
              <p className="mt-1 text-sm">{result.notification.body}</p>
              <a href={result.notification.href} className="mt-2 inline-block text-sm underline">
                {t.result.open}
              </a>
            </article>
            <div
              className="mt-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
              tabIndex={0}
              role="region"
              aria-label={t.result.title}
            >
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="py-2 pr-4">
                      {t.result.channel}
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      {t.result.status}
                    </th>
                    <th scope="col" className="py-2">
                      {t.result.date}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {DELIVERY_CHANNELS.map((channel) => {
                    const delivery = result.deliveries.find((row) => row.channel === channel);
                    if (delivery === undefined) return null;
                    const status = DELIVERY_STATUSES.includes(delivery.status)
                      ? t.result.statuses[delivery.status]
                      : delivery.status;
                    return (
                      <tr key={channel} data-testid={`spec-209-delivery-${channel}`}>
                        <td className="py-2 pr-4">{t.result.channels[channel]}</td>
                        <td className="py-2 pr-4">{status}</td>
                        <td className="py-2">{dateLabel(delivery.scheduledFor)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </BaseCard>

      <BaseCard testId="spec-209-digest" title={t.digest.title}>
        <p className="text-sm">{t.digest.intro}</p>
        {result === null || result.digest.heldCount === 0 ? (
          <p className="mt-3 text-sm" data-testid="spec-209-digest-empty">
            {t.digest.empty}
          </p>
        ) : (
          <div className="mt-3 text-sm" data-testid="spec-209-digest-held">
            <p>{t.digest.held(result.digest.heldCount, result.digest.heldMaxPerDay)}</p>
            <ul className="mt-2 list-disc pl-5">
              {result.digest.heldTitles.map((title) => (
                <li key={title}>{title}</li>
              ))}
            </ul>
          </div>
        )}
      </BaseCard>
    </>
  );
}
